use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex, MutexGuard, PoisonError,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    time::Duration,
};

use axum::{
    extract::ws::{Message, WebSocket},
    http::StatusCode,
};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tokio::sync::{Notify, mpsc};

use super::{
    groups::{self, Group, Groups, unused_name},
    logos,
    messages::{Event, GroupLayout, Layout, Request},
    sync,
    terminals::{self, HISTORY_LIMIT, Terminal},
};
use crate::{config, utils::paths};

const BACKLOG_LIMIT: usize = 16 * 1024 * 1024;

#[derive(Clone)]
struct Outbox {
    sender: mpsc::UnboundedSender<Message>,
    queued: Arc<AtomicUsize>,
    too_slow: Arc<Notify>,
}

struct Client {
    connection: u64,
    client_id: String,
    outbox: Outbox,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Tab {
    id: u64,
    custom_name: Option<String>,
    minimized: bool,
}

#[derive(Default)]
struct GroupTabs {
    tabs: Vec<Tab>,
    active_tab: Option<u64>,
}

struct Inner {
    groups: Vec<Group>,
    tabs: HashMap<u64, GroupTabs>,
    active_group: Option<u64>,
    next_tab: u64,
    terminals: HashMap<u64, Terminal>,
    active: Option<Client>,
}

pub(super) struct App {
    inner: Mutex<Inner>,
    groups_file: Mutex<()>,
    connections: AtomicU64,
    pub(super) secret: String,
}

impl App {
    pub(super) fn new(groups: Vec<Group>, secret: String) -> Self {
        App {
            inner: Mutex::new(Inner {
                groups,
                tabs: HashMap::new(),
                active_group: None,
                next_tab: 0,
                terminals: HashMap::new(),
                active: None,
            }),
            groups_file: Mutex::new(()),
            connections: AtomicU64::new(0),
            secret,
        }
    }
}

pub(super) async fn connect(app: Arc<App>, socket: WebSocket) {
    let connection = app.connections.fetch_add(1, Ordering::Relaxed);
    tracing::info!(connection, "browser connected");
    let (mut sink, mut stream) = socket.split();
    let (sender, mut receiver) = mpsc::unbounded_channel();
    let outbox = Outbox {
        sender,
        queued: Arc::new(AtomicUsize::new(0)),
        too_slow: Arc::new(Notify::new()),
    };
    let queued = outbox.queued.clone();
    let forwarding = tokio::spawn(async move {
        while let Some(message) = receiver.recv().await {
            let size = message_size(&message);
            let sent = sink.send(message).await;
            queued.fetch_sub(size, Ordering::Relaxed);
            if sent.is_err() {
                break;
            }
        }
    });
    let (requests, mut queue) = mpsc::unbounded_channel();
    let handling = app.clone();
    let too_slow = outbox.too_slow.clone();
    let handler = tokio::task::spawn_blocking(move || {
        while let Some(request) = queue.blocking_recv() {
            handling.request(connection, &outbox, request);
        }
        let mut inner = handling.lock();
        if inner
            .active
            .as_ref()
            .is_some_and(|client| client.connection == connection)
        {
            inner.active = None;
        }
    });
    loop {
        let message = tokio::select! {
            message = stream.next() => message,
            () = too_slow.notified() => {
                tracing::warn!(connection, "browser is not reading fast enough, disconnecting it");
                break;
            }
        };
        match message {
            Some(Ok(Message::Text(text))) => match serde_json::from_str(&text) {
                Ok(request) => {
                    let _ = requests.send(request);
                }
                Err(error) => tracing::warn!(connection, "invalid request: {error}"),
            },
            Some(Ok(Message::Binary(bytes))) => app.input(connection, &bytes),
            Some(Ok(Message::Ping(_) | Message::Pong(_) | Message::Close(_))) => {}
            Some(Err(_)) | None => break,
        }
    }
    drop(requests);
    forwarding.abort();
    tracing::info!(connection, "browser disconnected");
    if let Err(error) = handler.await {
        tracing::error!(connection, "request handler failed: {error}");
    }
}

impl App {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn request(self: &Arc<Self>, connection: u64, outbox: &Outbox, request: Request) {
        tracing::debug!(connection, ?request, "request");
        match request {
            Request::Hello { client_id } => {
                self.ensure_terminal();
                let mut inner = self.lock();
                if inner
                    .active
                    .as_ref()
                    .is_some_and(|client| client.client_id != client_id)
                {
                    tracing::info!(connection, "another browser is active, pausing this one");
                    send(&inner, outbox, &Event::Paused);
                    publish(&inner);
                    return;
                }
                activate(
                    &mut inner,
                    Client {
                        connection,
                        client_id,
                        outbox: outbox.clone(),
                    },
                );
                return;
            }
            Request::Resume { client_id } => {
                self.ensure_terminal();
                activate(
                    &mut self.lock(),
                    Client {
                        connection,
                        client_id,
                        outbox: outbox.clone(),
                    },
                );
                return;
            }
            Request::Ping => {
                send(&self.lock(), outbox, &Event::Pong);
                return;
            }
            _ if !self
                .lock()
                .active
                .as_ref()
                .is_some_and(|client| client.connection == connection) =>
            {
                return;
            }
            Request::Resize { id, cols, rows } => {
                if let Some(terminal) = self.lock().terminals.get(&id) {
                    terminal.resize(id, cols, rows);
                }
                return;
            }
            Request::CreateGroup => {
                let created = self.update_groups(|groups| {
                    let id = groups.next_id.checked_add(1)?;
                    groups.next_id = id;
                    let name = unused_name(groups.groups.iter().map(|group| &group.name));
                    groups.groups.push(Group {
                        id,
                        name,
                        logo: None,
                        directory: None,
                    });
                    Some(id)
                });
                let id = match created {
                    Ok(Some(id)) => id,
                    Ok(None) => {
                        tracing::error!("no group ids are left");
                        return;
                    }
                    Err(_) => return,
                };
                let mut inner = self.lock();
                inner.active_group = Some(id);
                self.create_tab(&mut inner, id);
            }
            Request::CreateTab { group_id } => self.create_tab(&mut self.lock(), group_id),
            Request::CloseGroup { id } => {
                let removed = self.update_groups(|groups| {
                    let index = groups.groups.iter().position(|group| group.id == id)?;
                    Some(groups.groups.remove(index))
                });
                if let Ok(Some(Group {
                    logo: Some(logo), ..
                })) = removed
                {
                    logos::delete(&logo);
                }
                self.ensure_terminal();
            }
            Request::CloseTab { id } => {
                let mut inner = self.lock();
                let Some(group_id) = close_tab(&mut inner, id) else {
                    return;
                };
                self.ensure_tab(&mut inner, group_id);
            }
            Request::RenameGroup { id, name } => {
                if name.is_empty() {
                    return;
                }
                let _ = self.update_groups(|groups| {
                    if let Some(group) = groups.groups.iter_mut().find(|group| group.id == id) {
                        group.name = name;
                    }
                });
            }
            Request::RenameTab { id, name } => {
                let mut inner = self.lock();
                let Some(tab) = inner
                    .tabs
                    .values_mut()
                    .flat_map(|tabs| tabs.tabs.iter_mut())
                    .find(|tab| tab.id == id)
                else {
                    return;
                };
                tab.custom_name = match name.is_empty() {
                    true => None,
                    false => Some(name),
                };
            }
            Request::MinimizeTab { id } => {
                let mut inner = self.lock();
                let Some((tabs, index)) = inner.tabs.values_mut().find_map(|tabs| {
                    let index = tabs.tabs.iter().position(|tab| tab.id == id)?;
                    Some((tabs, index))
                }) else {
                    return;
                };
                if !tabs.tabs.iter().any(|tab| tab.id != id && !tab.minimized) {
                    return;
                }
                tabs.tabs[index].minimized = true;
                if tabs.active_tab == Some(id) {
                    tabs.active_tab =
                        nearest_visible(&tabs.tabs, index).map(|index| tabs.tabs[index].id);
                }
            }
            Request::SetDirectory { id, directory } => {
                let _ = self.update_groups(|groups| {
                    if let Some(group) = groups.groups.iter_mut().find(|group| group.id == id) {
                        group.directory = match directory.is_empty() {
                            true => None,
                            false => Some(directory),
                        };
                    }
                });
            }
            Request::Select { group_id, tab_id } => {
                let mut guard = self.lock();
                let inner = &mut *guard;
                if !inner.groups.iter().any(|group| group.id == group_id) {
                    return;
                }
                let tabs = inner.tabs.entry(group_id).or_default();
                if let Some(tab_id) = tab_id
                    && let Some(tab) = tabs.tabs.iter_mut().find(|tab| tab.id == tab_id)
                {
                    tab.minimized = false;
                    tabs.active_tab = Some(tab_id);
                }
                let empty = tabs.tabs.is_empty();
                inner.active_group = Some(group_id);
                if empty {
                    self.create_tab(inner, group_id);
                }
            }
        }
        publish(&self.lock());
    }

    fn input(&self, connection: u64, bytes: &[u8]) {
        let inner = self.lock();
        if !inner
            .active
            .as_ref()
            .is_some_and(|client| client.connection == connection)
        {
            tracing::debug!(connection, "ignoring input from an inactive browser");
            return;
        }
        let Some((id, data)) = bytes.split_first_chunk::<8>() else {
            tracing::warn!(connection, "input message is too short");
            return;
        };
        let id = u64::from_be_bytes(*id);
        tracing::trace!(connection, id, bytes = data.len(), "input");
        match inner.terminals.get(&id) {
            Some(terminal) => terminal.write(id, data.to_vec()),
            None => tracing::warn!(id, "input for a terminal that does not exist"),
        }
    }

    pub(super) fn output(&self, id: u64, bytes: &[u8]) {
        let mut inner = self.lock();
        let Some(terminal) = inner.terminals.get_mut(&id) else {
            return;
        };
        tracing::trace!(id, bytes = bytes.len(), "output");
        terminal.record(bytes);
        forward(&inner, id, false, bytes);
    }

    pub(super) fn exited(self: &Arc<Self>, id: u64) {
        let mut inner = self.lock();
        let terminal = inner.terminals.remove(&id);
        if let Some(group_id) = close_tab(&mut inner, id) {
            tracing::info!(id, "terminal exited, closing its tab");
            match terminal
                .is_some_and(|terminal| terminal.started.elapsed() < Duration::from_secs(1))
            {
                true => tracing::warn!(
                    id,
                    "terminal exited right after it started, not opening a new one"
                ),
                false => self.ensure_tab(&mut inner, group_id),
            }
            publish(&inner);
        }
    }

    pub(super) fn terminal_pids(&self) -> Vec<(u64, u32)> {
        let inner = self.lock();
        inner
            .terminals
            .iter()
            .filter_map(|(id, terminal)| terminal.pid.map(|pid| (*id, pid)))
            .collect()
    }

    pub(super) fn set_branch(&self, id: u64, branch: Option<String>) {
        let mut inner = self.lock();
        let Some(terminal) = inner.terminals.get_mut(&id) else {
            return;
        };
        if terminal.branch == branch {
            return;
        }
        terminal.branch.clone_from(&branch);
        if let Some(client) = &inner.active {
            send(
                &inner,
                &client.outbox,
                &Event::Branch {
                    id,
                    branch: branch.as_deref(),
                },
            );
        }
    }

    fn create_tab(self: &Arc<Self>, inner: &mut Inner, group_id: u64) {
        let Some(group) = inner.groups.iter().find(|group| group.id == group_id) else {
            return;
        };
        let launch = match config::launch(group.directory.as_deref()) {
            Ok(launch) => launch,
            Err(error) => {
                tracing::error!("could not load config, terminal not created: {error}");
                return;
            }
        };
        let tabs = inner.tabs.entry(group_id).or_default();
        let cwd = match tabs.active_tab.and_then(|id| inner.terminals.get(&id)) {
            Some(terminal) => match terminal.directory() {
                Ok(directory) => directory,
                Err(error) => {
                    tracing::warn!(
                        "starting in the configured directory, could not read the directory of the active terminal: {error}"
                    );
                    launch.cwd
                }
            },
            None => launch.cwd,
        };
        inner.next_tab += 1;
        let id = inner.next_tab;
        match terminals::open(
            self,
            id,
            launch.command.as_deref(),
            cwd,
            &launch.environment,
        ) {
            Ok(terminal) => {
                inner.terminals.insert(id, terminal);
                tabs.tabs.push(Tab {
                    id,
                    custom_name: None,
                    minimized: false,
                });
                tabs.active_tab = Some(id);
            }
            Err(error) => tracing::error!(id, "could not start terminal: {error}"),
        }
    }

    fn ensure_terminal(self: &Arc<Self>) {
        if self.lock().groups.is_empty() {
            let _ = self.update_groups(|groups| {
                if !groups.groups.is_empty() {
                    return;
                }
                let Some(id) = groups.next_id.checked_add(1) else {
                    tracing::error!("no group ids are left");
                    return;
                };
                groups.next_id = id;
                groups.groups.push(Group {
                    id,
                    name: "~".to_string(),
                    logo: None,
                    directory: None,
                });
            });
        }
        let mut guard = self.lock();
        let inner = &mut *guard;
        if inner.active_group.is_none() {
            inner.active_group = inner.groups.first().map(|group| group.id);
        }
        if let Some(group_id) = inner.active_group {
            self.ensure_tab(inner, group_id);
        }
    }

    fn ensure_tab(self: &Arc<Self>, inner: &mut Inner, group_id: u64) {
        if inner
            .tabs
            .get(&group_id)
            .is_none_or(|tabs| tabs.tabs.is_empty())
        {
            self.create_tab(inner, group_id);
        }
    }

    fn lock_groups_file(&self) -> MutexGuard<'_, ()> {
        self.groups_file
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    fn update_groups<T>(&self, change: impl FnOnce(&mut Groups) -> T) -> Result<T, String> {
        let _groups_file = self.lock_groups_file();
        let (groups, result) = groups::update(change).inspect_err(|error| {
            tracing::error!("could not change groups: {error}");
        })?;
        set_groups(&mut self.lock(), groups.groups);
        sync::notify(self.secret.clone());
        Ok(result)
    }

    pub(super) fn reload(self: &Arc<Self>) {
        self.publish_config(&config::read());
        {
            let _groups_file = self.lock_groups_file();
            let groups = match groups::read() {
                Ok(groups) => groups,
                Err(error) => {
                    tracing::error!("keeping the current groups: {error}");
                    return;
                }
            };
            set_groups(&mut self.lock(), groups.groups);
        }
        if self.lock().active.is_some() {
            self.ensure_terminal();
        }
        publish(&self.lock());
    }

    pub(super) fn replace_logo(
        &self,
        group_id: u64,
        logo: Option<String>,
    ) -> Result<Option<String>, StatusCode> {
        let replaced = self.update_groups(|groups| {
            let group = groups
                .groups
                .iter_mut()
                .find(|group| group.id == group_id)?;
            Some(std::mem::replace(&mut group.logo, logo))
        });
        let previous = match replaced {
            Ok(Some(previous)) => previous,
            Ok(None) => return Err(StatusCode::NOT_FOUND),
            Err(_) => return Err(StatusCode::INTERNAL_SERVER_ERROR),
        };
        publish(&self.lock());
        Ok(previous)
    }

    pub(super) fn has_logo(&self, file: &str) -> bool {
        let inner = self.lock();
        inner
            .groups
            .iter()
            .any(|group| group.logo.as_deref() == Some(file))
    }

    pub(super) fn publish_config(&self, config: &config::Config) {
        let inner = self.lock();
        if let Some(client) = &inner.active {
            send(&inner, &client.outbox, &Event::Config { config });
        }
    }
}

fn activate(inner: &mut Inner, client: Client) {
    let connection = client.connection;
    tracing::info!(
        connection,
        client_id = client.client_id,
        "browser is now active"
    );
    if let Some(previous) = inner.active.replace(client)
        && previous.connection != connection
    {
        tracing::info!(
            connection = previous.connection,
            "pausing the previously active browser"
        );
        send(inner, &previous.outbox, &Event::Paused);
    }
    let Some(client) = &inner.active else {
        return;
    };
    let branches = inner
        .terminals
        .iter()
        .filter_map(|(id, terminal)| terminal.branch.as_deref().map(|branch| (*id, branch)))
        .collect();
    send(
        inner,
        &client.outbox,
        &Event::Active {
            layout: layout(inner),
            instance: paths::session_id(),
            branches,
        },
    );
    for tabs in inner.tabs.values() {
        for tab in &tabs.tabs {
            let history = inner
                .terminals
                .get(&tab.id)
                .map(Terminal::history)
                .unwrap_or_default();
            forward(inner, tab.id, true, &history);
        }
    }
}

fn set_groups(inner: &mut Inner, groups: Vec<Group>) {
    let index = inner
        .groups
        .iter()
        .position(|group| Some(group.id) == inner.active_group);
    inner.groups = groups;
    let missing: Vec<u64> = inner
        .tabs
        .keys()
        .filter(|id| !inner.groups.iter().any(|group| group.id == **id))
        .copied()
        .collect();
    for group_id in missing {
        let Some(tabs) = inner.tabs.remove(&group_id) else {
            continue;
        };
        tracing::info!(group_id, "group was closed, closing its terminals");
        for tab in tabs.tabs {
            if let Some(terminal) = inner.terminals.get_mut(&tab.id) {
                terminal.kill(tab.id);
            }
        }
    }
    let active_exists = inner
        .groups
        .iter()
        .any(|group| Some(group.id) == inner.active_group);
    if !active_exists && inner.active_group.is_some() {
        inner.active_group = index
            .and_then(|index| inner.groups.get(index))
            .or(inner.groups.last())
            .map(|group| group.id);
    }
}

fn close_tab(inner: &mut Inner, id: u64) -> Option<u64> {
    let (group_id, tabs) = inner
        .tabs
        .iter_mut()
        .find(|(_, tabs)| tabs.tabs.iter().any(|tab| tab.id == id))?;
    let index = tabs.tabs.iter().position(|tab| tab.id == id)?;
    tabs.tabs.remove(index);
    if tabs.active_tab == Some(id) {
        let next = nearest_visible(&tabs.tabs, index)
            .or_else(|| tabs.tabs.len().checked_sub(1).map(|last| index.min(last)));
        if let Some(next) = next {
            tabs.tabs[next].minimized = false;
        }
        tabs.active_tab = next.map(|next| tabs.tabs[next].id);
    }
    let group_id = *group_id;
    if let Some(terminal) = inner.terminals.get_mut(&id) {
        terminal.kill(id);
    }
    Some(group_id)
}

fn nearest_visible(tabs: &[Tab], index: usize) -> Option<usize> {
    (index..tabs.len())
        .chain((0..index.min(tabs.len())).rev())
        .find(|index| !tabs[*index].minimized)
}

fn layout(inner: &Inner) -> Layout<'_> {
    let groups = inner
        .groups
        .iter()
        .map(|group| {
            let tabs = inner.tabs.get(&group.id);
            GroupLayout {
                group,
                tabs: tabs.map_or(&[], |tabs| tabs.tabs.as_slice()),
                active_tab: tabs.and_then(|tabs| tabs.active_tab),
            }
        })
        .collect();
    Layout {
        groups,
        active_group: inner.active_group,
    }
}

fn publish(inner: &Inner) {
    if let Some(client) = &inner.active {
        send(
            inner,
            &client.outbox,
            &Event::Layout {
                layout: layout(inner),
            },
        );
    }
}

fn forward(inner: &Inner, id: u64, replay: bool, data: &[u8]) {
    let Some(client) = &inner.active else {
        return;
    };
    let mut bytes = id.to_be_bytes().to_vec();
    bytes.push(u8::from(replay));
    bytes.extend_from_slice(data);
    deliver(inner, &client.outbox, Message::Binary(bytes.into()));
}

fn send(inner: &Inner, outbox: &Outbox, event: &Event) {
    let text = serde_json::to_string(event).expect("events serialize");
    deliver(inner, outbox, Message::Text(text.into()));
}

fn deliver(inner: &Inner, outbox: &Outbox, message: Message) {
    let size = message_size(&message);
    let limit = BACKLOG_LIMIT + inner.terminals.len() * HISTORY_LIMIT;
    if outbox.queued.load(Ordering::Relaxed) + size > limit {
        outbox.too_slow.notify_one();
        return;
    }
    outbox.queued.fetch_add(size, Ordering::Relaxed);
    let _ = outbox.sender.send(message);
}

fn message_size(message: &Message) -> usize {
    match message {
        Message::Text(text) => text.len(),
        Message::Binary(bytes) => bytes.len(),
        Message::Ping(_) | Message::Pong(_) | Message::Close(_) => 0,
    }
}
