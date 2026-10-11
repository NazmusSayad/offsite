use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
};

use axum::{
    extract::ws::{Message, WebSocket},
    http::StatusCode,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::mpsc;

use super::{
    groups::{self, Group, Groups, unused_name},
    logos, sync,
    terminals::{self, Terminal},
};
use crate::{config, utils::paths};

#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum Request {
    Hello { client_id: String },
    Resume { client_id: String },
    Ping,
    CreateGroup,
    CreateTab { group_id: u64 },
    CloseGroup { id: u64 },
    CloseTab { id: u64 },
    RenameGroup { id: u64, name: String },
    RenameTab { id: u64, name: String },
    SetDirectory { id: u64, directory: String },
    Select { group_id: u64, tab_id: Option<u64> },
    Resize { id: u64, cols: u16, rows: u16 },
}

struct Client {
    connection: u64,
    client_id: String,
    sender: mpsc::UnboundedSender<Message>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Tab {
    id: u64,
    custom_name: Option<String>,
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
    let forwarding = tokio::spawn(async move {
        while let Some(message) = receiver.recv().await {
            if sink.send(message).await.is_err() {
                break;
            }
        }
    });
    while let Some(Ok(message)) = stream.next().await {
        match message {
            Message::Text(text) => match serde_json::from_str(&text) {
                Ok(request) => app.request(connection, &sender, request),
                Err(error) => tracing::warn!(connection, "invalid request: {error}"),
            },
            Message::Binary(bytes) => app.input(connection, &bytes),
            Message::Ping(_) | Message::Pong(_) | Message::Close(_) => {}
        }
    }
    forwarding.abort();
    tracing::info!(connection, "browser disconnected");
    let mut inner = app.inner.lock().unwrap();
    if inner
        .active
        .as_ref()
        .is_some_and(|client| client.connection == connection)
    {
        inner.active = None;
    }
}

impl App {
    fn request(
        self: &Arc<Self>,
        connection: u64,
        sender: &mpsc::UnboundedSender<Message>,
        request: Request,
    ) {
        let mut guard = self.inner.lock().unwrap();
        let inner = &mut *guard;
        let active = inner
            .active
            .as_ref()
            .is_some_and(|client| client.connection == connection);
        tracing::debug!(connection, active, ?request, "request");
        match request {
            Request::Hello { client_id } => {
                let available = match &inner.active {
                    None => true,
                    Some(client) => client.client_id == client_id,
                };
                if available {
                    let sender = sender.clone();
                    activate(
                        inner,
                        Client {
                            connection,
                            client_id,
                            sender,
                        },
                    );
                } else {
                    tracing::info!(connection, "another browser is active, pausing this one");
                    send(sender, json!({ "type": "paused" }));
                }
                return;
            }
            Request::Resume { client_id } => {
                let sender = sender.clone();
                activate(
                    inner,
                    Client {
                        connection,
                        client_id,
                        sender,
                    },
                );
                return;
            }
            Request::Ping => {
                send(sender, json!({ "type": "pong" }));
                return;
            }
            _ if !active => return,
            Request::Resize { id, cols, rows } => {
                if let Some(terminal) = inner.terminals.get(&id) {
                    terminal.resize(id, cols, rows);
                }
                return;
            }
            Request::CreateGroup => {
                let created = self.update_groups(inner, |groups| {
                    groups.next_id += 1;
                    let id = groups.next_id;
                    let name = unused_name(groups.groups.iter().map(|group| &group.name));
                    groups.groups.push(Group {
                        id,
                        name,
                        logo: None,
                        directory: None,
                    });
                    id
                });
                let Ok(id) = created else {
                    return;
                };
                inner.active_group = Some(id);
                self.create_tab(inner, id);
            }
            Request::CreateTab { group_id } => self.create_tab(inner, group_id),
            Request::CloseGroup { id } => {
                let removed = self.update_groups(inner, |groups| {
                    let index = groups.groups.iter().position(|group| group.id == id)?;
                    Some(groups.groups.remove(index))
                });
                if let Ok(Some(Group {
                    logo: Some(logo), ..
                })) = removed
                {
                    logos::delete(&logo);
                }
            }
            Request::CloseTab { id } => {
                let Some(group_id) = close_tab(inner, id) else {
                    return;
                };
                let reopen = inner.groups.iter().any(|group| {
                    group.id == group_id
                        && group.directory.is_some()
                        && inner
                            .tabs
                            .get(&group_id)
                            .is_none_or(|tabs| tabs.tabs.is_empty())
                });
                if reopen {
                    self.create_tab(inner, group_id);
                }
            }
            Request::RenameGroup { id, name } => {
                if name.is_empty() {
                    return;
                }
                let _ = self.update_groups(inner, |groups| {
                    if let Some(group) = groups.groups.iter_mut().find(|group| group.id == id) {
                        group.name = name;
                    }
                });
            }
            Request::RenameTab { id, name } => {
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
            Request::SetDirectory { id, directory } => {
                let _ = self.update_groups(inner, |groups| {
                    if let Some(group) = groups.groups.iter_mut().find(|group| group.id == id) {
                        group.directory = match directory.is_empty() {
                            true => None,
                            false => Some(directory),
                        };
                    }
                });
            }
            Request::Select { group_id, tab_id } => {
                if !inner.groups.iter().any(|group| group.id == group_id) {
                    return;
                }
                let tabs = inner.tabs.entry(group_id).or_default();
                if tab_id.is_some() {
                    tabs.active_tab = tab_id;
                }
                let empty = tabs.tabs.is_empty();
                inner.active_group = Some(group_id);
                if empty {
                    self.create_tab(inner, group_id);
                }
            }
        }
        publish(inner);
    }

    fn input(&self, connection: u64, bytes: &[u8]) {
        let inner = self.inner.lock().unwrap();
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
        let mut inner = self.inner.lock().unwrap();
        let Some(terminal) = inner.terminals.get_mut(&id) else {
            return;
        };
        tracing::trace!(id, bytes = bytes.len(), "output");
        terminal.record(bytes);
        forward(&inner, id, false, bytes);
    }

    pub(super) fn exited(&self, id: u64) {
        let mut inner = self.inner.lock().unwrap();
        inner.terminals.remove(&id);
        if close_tab(&mut inner, id).is_some() {
            tracing::info!(id, "terminal exited, closing its tab");
            publish(&inner);
        }
    }

    pub(super) fn terminal_pids(&self) -> Vec<(u64, u32)> {
        let inner = self.inner.lock().unwrap();
        inner
            .terminals
            .iter()
            .filter_map(|(id, terminal)| terminal.pid.map(|pid| (*id, pid)))
            .collect()
    }

    pub(super) fn set_branch(&self, id: u64, branch: Option<String>) {
        let mut inner = self.inner.lock().unwrap();
        let Some(terminal) = inner.terminals.get_mut(&id) else {
            return;
        };
        if terminal.branch == branch {
            return;
        }
        terminal.branch = branch;
        if let Some(client) = &inner.active {
            send(
                &client.sender,
                json!({ "type": "branch", "id": id, "branch": inner.terminals[&id].branch }),
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
        match terminals::open(self, id, launch.command.as_deref(), cwd) {
            Ok(terminal) => {
                inner.terminals.insert(id, terminal);
                tabs.tabs.push(Tab {
                    id,
                    custom_name: None,
                });
                tabs.active_tab = Some(id);
            }
            Err(error) => tracing::error!(id, "could not start terminal: {error}"),
        }
    }

    fn update_groups<T>(
        &self,
        inner: &mut Inner,
        change: impl FnOnce(&mut Groups) -> T,
    ) -> Result<T, String> {
        let (groups, result) = groups::update(change).inspect_err(|error| {
            tracing::error!("could not change groups: {error}");
        })?;
        set_groups(inner, groups.groups);
        sync::notify(self.secret.clone());
        Ok(result)
    }

    pub(super) fn reload(&self) {
        self.publish_config(&config::read());
        let groups = match groups::read() {
            Ok(groups) => groups,
            Err(error) => {
                tracing::error!("keeping the current groups: {error}");
                return;
            }
        };
        let mut inner = self.inner.lock().unwrap();
        set_groups(&mut inner, groups.groups);
        publish(&inner);
    }

    pub(super) fn replace_logo(
        &self,
        group_id: u64,
        logo: Option<String>,
    ) -> Result<Option<String>, StatusCode> {
        let mut inner = self.inner.lock().unwrap();
        let replaced = self.update_groups(&mut inner, |groups| {
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
        publish(&inner);
        Ok(previous)
    }

    pub(super) fn has_logo(&self, file: &str) -> bool {
        let inner = self.inner.lock().unwrap();
        inner
            .groups
            .iter()
            .any(|group| group.logo.as_deref() == Some(file))
    }

    pub(super) fn publish_config(&self, config: &config::Config) {
        let inner = self.inner.lock().unwrap();
        if let Some(client) = &inner.active {
            send(
                &client.sender,
                json!({ "type": "config", "config": config }),
            );
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
        send(&previous.sender, json!({ "type": "paused" }));
    }
    let Some(client) = &inner.active else {
        return;
    };
    let branches: HashMap<u64, &String> = inner
        .terminals
        .iter()
        .filter_map(|(id, terminal)| terminal.branch.as_ref().map(|branch| (*id, branch)))
        .collect();
    send(
        &client.sender,
        json!({ "type": "active", "layout": layout(inner), "instance": paths::session_id(), "branches": branches }),
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
        tabs.active_tab = tabs.tabs.get(index).or(tabs.tabs.last()).map(|tab| tab.id);
    }
    let group_id = *group_id;
    if let Some(terminal) = inner.terminals.get_mut(&id) {
        terminal.kill(id);
    }
    Some(group_id)
}

fn layout(inner: &Inner) -> serde_json::Value {
    let groups: Vec<serde_json::Value> = inner
        .groups
        .iter()
        .map(|group| {
            let tabs = inner.tabs.get(&group.id);
            json!({
                "id": group.id,
                "name": group.name,
                "logo": group.logo,
                "directory": group.directory,
                "tabs": tabs.map_or(&[][..], |tabs| &tabs.tabs[..]),
                "activeTab": tabs.and_then(|tabs| tabs.active_tab),
            })
        })
        .collect();
    json!({ "groups": groups, "activeGroup": inner.active_group })
}

fn publish(inner: &Inner) {
    if let Some(client) = &inner.active {
        send(
            &client.sender,
            json!({ "type": "layout", "layout": layout(inner) }),
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
    let _ = client.sender.send(Message::Binary(bytes.into()));
}

fn send(sender: &mpsc::UnboundedSender<Message>, value: serde_json::Value) {
    let _ = sender.send(Message::Text(value.to_string().into()));
}
