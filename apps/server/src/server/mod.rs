mod app;
mod assets;
mod backgrounds;
mod directories;
mod groups;
mod logos;
mod messages;
mod paste;
mod push;
#[cfg(unix)]
mod shell_integration;
mod shells;
mod sync;
mod terminals;

use std::{collections::HashMap, fs, sync::Arc};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, State, WebSocketUpgrade},
    http::StatusCode,
    response::Response,
    routing::{get, post, put},
    serve::ListenerExt,
};

use crate::{config, logging, utils::paths};
use app::App;

pub fn run(host: String, port: u16, debug: bool) {
    if let Err(error) = logging::init(debug) {
        eprintln!(
            "could not create the log in {}: {error}",
            paths::session_directory().display()
        );
        std::process::exit(1);
    }
    #[cfg(windows)]
    if unsafe { windows_sys::Win32::System::Console::SetConsoleCtrlHandler(None, 0) } == 0 {
        tracing::warn!(
            "could not enable ctrl+c for terminals: {}",
            std::io::Error::last_os_error()
        );
    }
    if let Err(error) = config::create() {
        tracing::error!(
            "could not create {}: {error}",
            paths::config_file().display()
        );
        std::process::exit(1);
    }
    let secret = match sync::secret() {
        Ok(secret) => secret,
        Err(error) => {
            tracing::error!("could not read or create the secret: {error}");
            std::process::exit(1);
        }
    };
    let groups = match groups::read() {
        Ok(groups) => groups,
        Err(error) => {
            tracing::error!("{error}");
            std::process::exit(1);
        }
    };
    let app = Arc::new(App::new(groups.groups, secret));
    let watching = app.clone();
    std::thread::spawn(move || terminals::watch_branches(&watching));
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(runtime) => runtime,
        Err(error) => {
            tracing::error!("could not start the async runtime: {error}");
            std::process::exit(1);
        }
    };
    runtime.block_on(serve(app, host, port, debug));
}

async fn serve(app: Arc<App>, host: String, port: u16, debug: bool) {
    let mut router = Router::new()
        .route("/ws", get(socket))
        .route("/api/config", get(config::handler).put(save_config))
        .route("/api/directories", get(directories::list))
        .route("/api/shells", get(shells::list))
        .route(
            "/api/groups/{id}/logo",
            put(logos::upload).delete(logos::remove),
        )
        .route("/api/logos/{file}", get(logos::serve))
        .route("/api/tabs/{ids}/busy", get(busy))
        .route(
            "/api/groups/{id}/background",
            put(backgrounds::upload_group)
                .delete(backgrounds::remove_group)
                .layer(DefaultBodyLimit::max(20 * 1024 * 1024)),
        )
        .route(
            "/api/background",
            put(backgrounds::upload)
                .delete(backgrounds::remove)
                .layer(DefaultBodyLimit::max(20 * 1024 * 1024)),
        )
        .route("/api/backgrounds/{file}", get(backgrounds::serve))
        .route(
            "/api/paste",
            post(paste::upload).layer(DefaultBodyLimit::max(50 * 1024 * 1024)),
        )
        .route("/api/sync", post(sync::receive))
        .route("/api/push/key", get(push::key))
        .route(
            "/api/push/subscription",
            put(push::subscribe).delete(push::unsubscribe),
        );
    if debug {
        router = router.route("/api/debug/logs", get(debug_log));
    }
    let router = router.fallback(assets::asset).with_state(app);
    let listener = match tokio::net::TcpListener::bind((host.as_str(), port)).await {
        Ok(listener) => listener,
        Err(error) => {
            tracing::error!(
                "could not listen on {host}:{port}, is sshtty already running? {error}"
            );
            std::process::exit(1);
        }
    };
    let address = listener.local_addr().expect("listener has an address");
    let _registration = match sync::register(address) {
        Ok(lock) => lock,
        Err(error) => {
            tracing::error!("could not register this session: {error}");
            std::process::exit(1);
        }
    };
    push::start(address);
    tracing::info!("listening on http://{address}");
    let listener = listener.tap_io(|stream| {
        if let Err(error) = stream.set_nodelay(true) {
            tracing::warn!("could not disable packet batching for a browser connection: {error}");
        }
    });
    axum::serve(listener, router).await.expect("server failed");
}

async fn save_config(
    State(app): State<Arc<App>>,
    Json(config): Json<config::Config>,
) -> Result<Json<config::Config>, (StatusCode, String)> {
    let config = config::save(config)?;
    app.publish_config(&config);
    sync::notify(app.secret.clone());
    Ok(Json(config))
}

async fn busy(
    State(app): State<Arc<App>>,
    Path(ids): Path<String>,
) -> Result<Json<HashMap<u64, Result<Option<String>, String>>>, (StatusCode, String)> {
    let ids = ids
        .split(',')
        .map(str::parse)
        .collect::<Result<Vec<u64>, _>>()
        .map_err(|error| (StatusCode::BAD_REQUEST, error.to_string()))?;
    Ok(Json(app.busy_programs(&ids)))
}

async fn debug_log() -> Result<String, (StatusCode, String)> {
    fs::read_to_string(paths::log_file())
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))
}

async fn socket(upgrade: WebSocketUpgrade, State(app): State<Arc<App>>) -> Response {
    upgrade.on_upgrade(move |socket| app::connect(app, socket))
}
