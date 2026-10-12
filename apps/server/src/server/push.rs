use std::{
    fs, io,
    time::{Duration, Instant},
};

use axum::{
    Json,
    http::{HeaderValue, StatusCode, Uri},
};
use base64ct::{Base64UrlUnpadded, Encoding};
use serde::{Deserialize, Serialize};
use web_push_native::{
    Auth, WebPushBuilder,
    jwt_simple::algorithms::{ECDSAP256PublicKeyLike, ES256KeyPair},
    p256::PublicKey,
};

use crate::utils::{
    fs::{lock_folder, write_private_atomic},
    paths,
};

pub(super) const BELL_DELAY: Duration = Duration::from_millis(500);
const BELL_GAP: Duration = Duration::from_secs(5);
const NOTIFICATION_GAP: Duration = Duration::from_secs(1);
const PAYLOAD_LIMIT: usize = 1024;
const SUBJECT: &str = "https://github.com/NazmusSayad/sshtty";
const ESC: u8 = 0x1b;
const BEL: u8 = 0x07;
const CAN: u8 = 0x18;
const SUB: u8 = 0x1a;

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
pub(super) struct Alerts {
    state: State,
    payload: Vec<u8>,
    pub(super) title: String,
    pushed_at: Option<Instant>,
    bell_pending: bool,
}

impl Alerts {
    pub(super) fn scan(&mut self, bytes: &[u8]) -> Option<Alert> {
        let mut alert = None;
        for &byte in bytes {
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

fn load() -> io::Result<Store> {
    let path = paths::push_file();
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).map_err(|error| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("{} is corrupt: {error}", path.display()),
            )
        }),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let store = Store {
                private_key: Base64UrlUnpadded::encode_string(&ES256KeyPair::generate().to_bytes()),
                subscriptions: Vec::new(),
            };
            save(&store)?;
            Ok(store)
        }
        Err(error) => Err(error),
    }
}

fn save(store: &Store) -> io::Result<()> {
    let text = serde_json::to_vec_pretty(store).expect("push settings serialize");
    write_private_atomic(&paths::push_file(), &text)
}

fn read() -> io::Result<Store> {
    let _lock = lock_folder()?;
    load()
}

fn update(change: impl FnOnce(&mut Store)) -> io::Result<()> {
    let _lock = lock_folder()?;
    let mut store = load()?;
    change(&mut store);
    save(&store)
}

fn key_pair(store: &Store) -> Result<ES256KeyPair, String> {
    let bytes = Base64UrlUnpadded::decode_vec(&store.private_key)
        .map_err(|error| format!("invalid push key: {error}"))?;
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
    Ok(WebPushBuilder::new(
        endpoint,
        public,
        Auth::clone_from_slice(&auth),
    ))
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
    Json(subscription): Json<Subscription>,
) -> Result<StatusCode, (StatusCode, String)> {
    builder(&subscription).map_err(|error| (StatusCode::BAD_REQUEST, error))?;
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

pub(super) fn send(message: &Message) {
    let store = match read() {
        Ok(store) => store,
        Err(error) => {
            tracing::error!("could not read push subscriptions: {error}");
            return;
        }
    };
    if store.subscriptions.is_empty() {
        return;
    }
    let key_pair = match key_pair(&store) {
        Ok(key_pair) => key_pair,
        Err(error) => {
            tracing::error!("{error}");
            return;
        }
    };
    let payload = serde_json::to_vec(message).expect("push messages serialize");
    let agent = ureq::Agent::new_with_config(
        ureq::Agent::config_builder()
            .http_status_as_error(false)
            .https_only(true)
            .timeout_global(Some(Duration::from_secs(10)))
            .build(),
    );
    let mut gone = Vec::new();
    for subscription in &store.subscriptions {
        let request = builder(subscription).and_then(|builder| {
            builder
                .with_vapid(&key_pair, SUBJECT)
                .build(payload.clone())
                .map_err(|error| error.to_string())
        });
        let mut request = match request {
            Ok(request) => request,
            Err(error) => {
                tracing::warn!(
                    endpoint = subscription.endpoint,
                    "could not build a push: {error}"
                );
                continue;
            }
        };
        request
            .headers_mut()
            .insert("urgency", HeaderValue::from_static("high"));
        match agent.run(request) {
            Ok(response) => match response.status() {
                status if status.is_success() => {
                    tracing::debug!(endpoint = subscription.endpoint, "push sent");
                }
                StatusCode::NOT_FOUND | StatusCode::GONE => {
                    tracing::info!(
                        endpoint = subscription.endpoint,
                        "push subscription is gone, removing it"
                    );
                    gone.push(subscription.endpoint.clone());
                }
                status => tracing::warn!(
                    endpoint = subscription.endpoint,
                    %status,
                    "push service rejected a push"
                ),
            },
            Err(error) => tracing::warn!(
                endpoint = subscription.endpoint,
                "could not send a push: {error}"
            ),
        }
    }
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
