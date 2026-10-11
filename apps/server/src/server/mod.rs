mod app;
mod assets;
mod debug;
mod directories;
mod groups;
mod logos;
mod paste;
mod shells;
mod sync;
mod terminals;

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State, WebSocketUpgrade},
    http::StatusCode,
    response::Response,
    routing::{get, post, put},
    serve::ListenerExt,
};

use crate::{config, logging};
use app::App;

pub fn run(host: String, port: u16, debug: bool) {
    logging::init(debug);
    #[cfg(windows)]
    if unsafe { windows_sys::Win32::System::Console::SetConsoleCtrlHandler(None, 0) } == 0 {
        tracing::warn!(
            "could not enable ctrl+c for terminals: {}",
            std::io::Error::last_os_error()
        );
    }
    config::create().expect("could not create the config file");
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
    tokio::runtime::Runtime::new()
        .expect("could not start the async runtime")
        .block_on(serve(app, host, port, debug));
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
        .route(
            "/api/paste",
            post(paste::upload).layer(DefaultBodyLimit::max(50 * 1024 * 1024)),
        )
        .route("/api/sync", post(sync::receive));
    if debug {
        router = router.route("/api/debug/logs", get(debug::log));
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

async fn socket(upgrade: WebSocketUpgrade, State(app): State<Arc<App>>) -> Response {
    upgrade.on_upgrade(move |socket| app::connect(app, socket))
}
