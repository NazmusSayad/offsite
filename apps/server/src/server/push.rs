use std::{
    fs, io,
    net::SocketAddr,
    sync::{
        Mutex, OnceLock, PoisonError,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

use axum::{
    Json,
    http::{HeaderValue, StatusCode, Uri},
};
use base64ct::{Base64UrlUnpadded, Encoding};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use web_push_native::{
    Auth, WebPushBuilder,
    jwt_simple::algorithms::{ECDSAP256PublicKeyLike, ES256KeyPair},
    p256::PublicKey,
};

use crate::utils::{
    fs::{lock_folder, write_private_atomic},
    paths,
};

pub(super) const ALERT_DELAY: Duration = Duration::from_millis(500);
const BELL_GAP: Duration = Duration::from_secs(5);
const NOTIFICATION_GAP: Duration = Duration::from_secs(1);
const PAYLOAD_LIMIT: usize = 1024;
const TITLE_LIMIT: usize = 100;
const BODY_LIMIT: usize = 500;
const TIME_TO_LIVE: Duration = Duration::from_secs(15 * 60);
const SEND_TIMEOUT: Duration = Duration::from_secs(10);
const PARALLEL_SENDS: usize = 8;
const SUBJECT: &str = "https://github.com/NazmusSayad/sshtty";
const ESC: u8 = 0x1b;
const BEL: u8 = 0x07;
const CAN: u8 = 0x18;
const SUB: u8 = 0x1a;

static SERVER: OnceLock<String> = OnceLock::new();
static ACTIVE: AtomicBool = AtomicBool::new(false);

pub(super) enum Alert {
    Bell,
    Notification { title: String, body: String },
}

#[derive(Default)]
enum State {
    #[default]
    Ground,
    Escape,
    Osc,
    OscEscape,
    Text,
    TextEscape,
}

#[derive(Default)]
pub(super) struct Scanner {
    state: State,
    payload: Vec<u8>,
    pub(super) title: String,
}

#[derive(Default)]
pub(super) struct Alerts {
    pushed_at: Option<Instant>,
    bell_pending: bool,
}

impl Scanner {
    pub(super) fn scan(&mut self, bytes: &[u8]) -> Option<Alert> {
        let mut alert = None;
        let mut index = 0;
        while index < bytes.len() {
            if matches!(self.state, State::Ground) {
                match bytes[index..]
                    .iter()
                    .position(|&byte| byte == ESC || byte == BEL)
                {
                    Some(offset) => index += offset,
                    None => break,
                }
            }
            let byte = bytes[index];
            index += 1;
            match self.step(byte) {
                Some(Alert::Bell) if alert.is_none() => alert = Some(Alert::Bell),
                Some(Alert::Bell) | None => {}
                Some(notification) => alert = Some(notification),
            }
        }
        alert
    }

    fn step(&mut self, byte: u8) -> Option<Alert> {
        if byte == CAN || byte == SUB {
            self.state = State::Ground;
            return None;
        }
        match self.state {
            State::Ground => match byte {
                ESC => self.state = State::Escape,
                BEL => return Some(Alert::Bell),
                _ => {}
            },
            State::Escape => {
                self.state = match byte {
                    b']' => {
                        self.payload.clear();
                        State::Osc
                    }
                    b'P' | b'X' | b'^' | b'_' => State::Text,
                    ESC => State::Escape,
                    _ => State::Ground,
                };
                if byte == BEL {
                    return Some(Alert::Bell);
                }
            }
            State::Osc => match byte {
                BEL => {
                    self.state = State::Ground;
                    return self.finish();
                }
                ESC => self.state = State::OscEscape,
                _ => {
                    if self.payload.len() < PAYLOAD_LIMIT {
                        self.payload.push(byte);
                    }
                }
            },
            State::OscEscape => {
                if byte == b'\\' {
                    self.state = State::Ground;
                    return self.finish();
                }
                self.state = State::Escape;
                return self.step(byte);
            }
            State::Text => {
                if byte == ESC {
                    self.state = State::TextEscape;
                }
            }
            State::TextEscape => {
                if byte == b'\\' {
                    self.state = State::Ground;
                    return None;
                }
                self.state = State::Escape;
                return self.step(byte);
            }
        }
        None
    }

    fn finish(&mut self) -> Option<Alert> {
        let text = String::from_utf8_lossy(&self.payload).into_owned();
        if let Some(title) = text.strip_prefix("0;").or_else(|| text.strip_prefix("2;")) {
            self.title = title.to_string();
            return None;
        }
        if let Some(body) = text.strip_prefix("9;") {
            let digits = body.bytes().take_while(u8::is_ascii_digit).count();
            if digits > 0 && matches!(body.as_bytes().get(digits), None | Some(b';')) {
                return None;
            }
            return Some(Alert::Notification {
                title: String::new(),
                body: body.to_string(),
            });
        }
        if let Some(rest) = text.strip_prefix("777;notify;") {
            let (title, body) = match rest.split_once(';') {
                Some((title, body)) => (title, body),
                None => (rest, ""),
            };
            return Some(Alert::Notification {
                title: title.to_string(),
                body: body.to_string(),
            });
        }
        None
    }
}

impl Alerts {
    pub(super) fn start_bell(&mut self) -> bool {
        if self.bell_pending || self.pushed_recently(BELL_GAP) {
            return false;
        }
        self.bell_pending = true;
        true
    }

    pub(super) fn finish_bell(&mut self) -> bool {
        if !self.bell_pending {
            return false;
        }
        self.bell_pending = false;
        self.pushed_at = Some(Instant::now());
        true
    }

    pub(super) fn start_notification(&mut self) -> bool {
        self.bell_pending = false;
        if self.pushed_recently(NOTIFICATION_GAP) {
            return false;
        }
        self.pushed_at = Some(Instant::now());
        true
    }

    fn pushed_recently(&self, gap: Duration) -> bool {
        self.pushed_at.is_some_and(|at| at.elapsed() < gap)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Message {
    pub(super) title: String,
    pub(super) body: String,
    pub(super) group_id: u64,
    pub(super) tab_id: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Store {
    private_key: String,
    subscriptions: Vec<Subscription>,
}

#[derive(Serialize, Deserialize)]
pub(super) struct Subscription {
    endpoint: String,
    keys: Keys,
    server: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct Keys {
    p256dh: String,
    auth: String,
}

#[derive(Deserialize)]
pub(super) struct Unsubscribe {
    endpoint: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Key {
    public_key: String,
}

pub(super) fn start(address: SocketAddr) {
    SERVER
        .set(address.to_string())
        .expect("push is started only once");
    let path = paths::push_file();
    match fs::read(&path) {
        Ok(bytes) => match serde_json::from_slice::<Store>(&bytes) {
            Ok(store) => {
                let unknown = store
                    .subscriptions
                    .iter()
                    .filter(|subscription| subscription.server.is_none())
                    .count();
                if unknown > 0 {
                    tracing::warn!(
                        "ignoring {unknown} push subscriptions in {} saved by an older sshtty until their browsers open sshtty again",
                        path.display()
                    );
                }
                track(&store);
            }
            Err(error) => tracing::warn!(
                "push notifications are off until a browser turns them on again, {} is corrupt: {error}",
                path.display()
            ),
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => tracing::warn!(
            "push notifications are off, could not read {}: {error}",
            path.display()
        ),
    }
}

pub(super) fn active() -> bool {
    ACTIVE.load(Ordering::Relaxed)
}

fn server() -> &'static str {
    SERVER.get().expect("push is started before serving")
}

fn ours(subscription: &Subscription) -> bool {
    subscription.server.as_deref() == Some(server())
}

fn track(store: &Store) {
    ACTIVE.store(store.subscriptions.iter().any(ours), Ordering::Relaxed);
}

fn load() -> io::Result<Store> {
    let path = paths::push_file();
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return create(),
        Err(error) => {
            return Err(io::Error::new(
                error.kind(),
                format!("could not read {}: {error}", path.display()),
            ));
        }
    };
    let parsed = serde_json::from_slice(&bytes)
        .map_err(|error| error.to_string())
        .and_then(|store: Store| key_pair(&store).map(|_| store));
    let error = match parsed {
        Ok(store) => return Ok(store),
        Err(error) => error,
    };
    let aside = path.with_extension(format!("json.corrupt-{}", Uuid::new_v4().simple()));
    if let Err(rename) = fs::rename(&path, &aside) {
        return Err(io::Error::new(
            rename.kind(),
            format!(
                "{} is corrupt ({error}) and could not be moved aside: {rename}",
                path.display()
            ),
        ));
    }
    tracing::warn!(
        "{} is corrupt, moved it to {} and created a new one: {error}",
        path.display(),
        aside.display()
    );
    create()
}

fn create() -> io::Result<Store> {
    let store = Store {
        private_key: Base64UrlUnpadded::encode_string(&ES256KeyPair::generate().to_bytes()),
        subscriptions: Vec::new(),
    };
    save(&store)?;
    Ok(store)
}

fn save(store: &Store) -> io::Result<()> {
    let path = paths::push_file();
    let text = serde_json::to_vec_pretty(store).expect("push settings serialize");
    write_private_atomic(&path, &text).map_err(|error| {
        io::Error::new(
            error.kind(),
            format!("could not write {}: {error}", path.display()),
        )
    })
}

fn read() -> io::Result<Store> {
    let _lock = lock_folder()?;
    let store = load()?;
    track(&store);
    Ok(store)
}

fn update(change: impl FnOnce(&mut Store)) -> io::Result<()> {
    let _lock = lock_folder()?;
    let mut store = load()?;
    change(&mut store);
    save(&store)?;
    track(&store);
    Ok(())
}

fn key_pair(store: &Store) -> Result<ES256KeyPair, String> {
    let bytes = Base64UrlUnpadded::decode_vec(&store.private_key)
        .map_err(|error| format!("invalid push key: {error}"))?;
    if bytes.len() != 32 {
        return Err(format!(
            "invalid push key: it is {} bytes instead of 32",
            bytes.len()
        ));
    }
    ES256KeyPair::from_bytes(&bytes).map_err(|error| format!("invalid push key: {error}"))
}

fn builder(subscription: &Subscription) -> Result<WebPushBuilder, String> {
    let endpoint: Uri = subscription
        .endpoint
        .parse()
        .map_err(|error| format!("invalid endpoint: {error}"))?;
    if endpoint.scheme_str() != Some("https") || endpoint.host().is_none() {
        return Err("the endpoint must be an https URL".to_string());
    }
    let public = Base64UrlUnpadded::decode_vec(subscription.keys.p256dh.trim_end_matches('='))
        .map_err(|error| format!("invalid p256dh key: {error}"))?;
    let public = PublicKey::from_sec1_bytes(&public)
        .map_err(|error| format!("invalid p256dh key: {error}"))?;
    let auth = Base64UrlUnpadded::decode_vec(subscription.keys.auth.trim_end_matches('='))
        .map_err(|error| format!("invalid auth secret: {error}"))?;
    if auth.len() != 16 {
        return Err("the auth secret must be 16 bytes".to_string());
    }
    Ok(
        WebPushBuilder::new(endpoint, public, Auth::clone_from_slice(&auth))
            .with_valid_duration(TIME_TO_LIVE),
    )
}

pub(super) async fn key() -> Result<Json<Key>, (StatusCode, String)> {
    let failed = |error: String| (StatusCode::INTERNAL_SERVER_ERROR, error);
    let store = read().map_err(|error| failed(error.to_string()))?;
    let key_pair = key_pair(&store).map_err(failed)?;
    Ok(Json(Key {
        public_key: Base64UrlUnpadded::encode_string(
            &key_pair.public_key().public_key().to_bytes_uncompressed(),
        ),
    }))
}

pub(super) async fn subscribe(
    Json(mut subscription): Json<Subscription>,
) -> Result<StatusCode, (StatusCode, String)> {
    builder(&subscription).map_err(|error| (StatusCode::BAD_REQUEST, error))?;
    subscription.server = Some(server().to_string());
    update(|store| {
        store
            .subscriptions
            .retain(|existing| existing.endpoint != subscription.endpoint);
        store.subscriptions.push(subscription);
    })
    .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    tracing::info!("a browser subscribed to push notifications");
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn unsubscribe(
    Json(request): Json<Unsubscribe>,
) -> Result<StatusCode, (StatusCode, String)> {
    update(|store| {
        store
            .subscriptions
            .retain(|existing| existing.endpoint != request.endpoint);
    })
    .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    tracing::info!("a browser unsubscribed from push notifications");
    Ok(StatusCode::NO_CONTENT)
}

pub(super) fn send(mut message: Message) {
    let store = match read() {
        Ok(store) => store,
        Err(error) => {
            tracing::error!("could not read push subscriptions: {error}");
            return;
        }
    };
    let subscriptions: Vec<&Subscription> = store
        .subscriptions
        .iter()
        .filter(|subscription| ours(subscription))
        .collect();
    if subscriptions.is_empty() {
        return;
    }
    let key_pair = match key_pair(&store) {
        Ok(key_pair) => key_pair,
        Err(error) => {
            tracing::error!("{error}");
            return;
        }
    };
    shorten(&mut message.title, TITLE_LIMIT);
    shorten(&mut message.body, BODY_LIMIT);
    let payload = serde_json::to_vec(&message).expect("push messages serialize");
    let agent = ureq::Agent::new_with_config(
        ureq::Agent::config_builder()
            .http_status_as_error(false)
            .https_only(true)
            .timeout_global(Some(SEND_TIMEOUT))
            .build(),
    );
    let gone = Mutex::new(Vec::new());
    let next = AtomicUsize::new(0);
    thread::scope(|scope| {
        for _ in 0..PARALLEL_SENDS.min(subscriptions.len()) {
            scope.spawn(|| {
                while let Some(subscription) =
                    subscriptions.get(next.fetch_add(1, Ordering::Relaxed))
                {
                    if deliver(&agent, &key_pair, &payload, subscription) {
                        gone.lock()
                            .unwrap_or_else(PoisonError::into_inner)
                            .push(subscription.endpoint.clone());
                    }
                }
            });
        }
    });
    let gone = gone.into_inner().unwrap_or_else(PoisonError::into_inner);
    if gone.is_empty() {
        return;
    }
    if let Err(error) = update(|store| {
        store
            .subscriptions
            .retain(|subscription| !gone.contains(&subscription.endpoint));
    }) {
        tracing::error!("could not remove gone push subscriptions: {error}");
    }
}

fn deliver(
    agent: &ureq::Agent,
    key_pair: &ES256KeyPair,
    payload: &[u8],
    subscription: &Subscription,
) -> bool {
    let request = builder(subscription).and_then(|builder| {
        builder
            .with_vapid(key_pair, SUBJECT)
            .build(payload)
            .map_err(|error| error.to_string())
    });
    let mut request = match request {
        Ok(request) => request,
        Err(error) => {
            tracing::warn!(
                endpoint = subscription.endpoint,
                "could not build a push: {error}"
            );
            return false;
        }
    };
    request
        .headers_mut()
        .insert("urgency", HeaderValue::from_static("high"));
    match agent.run(request) {
        Ok(response) => match response.status() {
            status if status.is_success() => {
                tracing::debug!(endpoint = subscription.endpoint, "push sent");
                false
            }
            StatusCode::UNAUTHORIZED
            | StatusCode::FORBIDDEN
            | StatusCode::NOT_FOUND
            | StatusCode::GONE => {
                tracing::info!(
                    endpoint = subscription.endpoint,
                    status = %response.status(),
                    "push subscription is gone or was made for another key, removing it"
                );
                true
            }
            status => {
                tracing::warn!(
                    endpoint = subscription.endpoint,
                    %status,
                    "push service rejected a push"
                );
                false
            }
        },
        Err(error) => {
            tracing::warn!(
                endpoint = subscription.endpoint,
                "could not send a push: {error}"
            );
            false
        }
    }
}

fn shorten(text: &mut String, limit: usize) {
    if let Some((index, _)) = text.char_indices().nth(limit) {
        text.truncate(index);
    }
}
