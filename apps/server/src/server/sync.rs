use std::{
    fs::{self, File, OpenOptions, TryLockError},
    io::{self, Write},
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    path::Path,
    sync::Arc,
    time::Duration,
};

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};
use uuid::Uuid;

use super::app::App;
use crate::utils::{fs::lock_folder, paths};

const SERVER_FILE: &str = "server.json";
const SERVER_LOCK: &str = "server.lock";
const SECRET_HEADER: &str = "x-sshtty-secret";

#[derive(Serialize, Deserialize)]
struct Server {
    address: SocketAddr,
}

pub(super) fn secret() -> io::Result<String> {
    let _lock = lock_folder()?;
    match fs::read_to_string(paths::secret_file()) {
        Ok(secret) => return Ok(secret),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    let secret = Uuid::new_v4().to_string();
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
        .open(paths::secret_file())?
        .write_all(secret.as_bytes())?;
    Ok(secret)
}

pub(super) fn register(address: SocketAddr) -> io::Result<File> {
    let directory = paths::session_directory();
    let lock = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(directory.join(SERVER_LOCK))?;
    lock.lock()?;
    let ip = match address.ip() {
        IpAddr::V4(ip) if ip.is_unspecified() => IpAddr::V4(Ipv4Addr::LOCALHOST),
        IpAddr::V6(ip) if ip.is_unspecified() => IpAddr::V6(Ipv6Addr::LOCALHOST),
        ip => ip,
    };
    let server = Server {
        address: SocketAddr::new(ip, address.port()),
    };
    fs::write(
        directory.join(SERVER_FILE),
        serde_json::to_vec(&server).expect("server address serializes"),
    )?;
    Ok(lock)
}

pub(super) fn notify(secret: String) {
    tokio::spawn(async move {
        for address in other_servers() {
            tokio::spawn(send(address, secret.clone()));
        }
    });
}

pub(super) async fn receive(State(app): State<Arc<App>>, headers: HeaderMap) -> StatusCode {
    let secret = headers
        .get(SECRET_HEADER)
        .and_then(|value| value.to_str().ok());
    if secret != Some(app.secret.as_str()) {
        tracing::warn!("rejected a sync request with a wrong secret");
        return StatusCode::FORBIDDEN;
    }
    tracing::info!("another server changed shared files, reloading");
    app.reload();
    StatusCode::NO_CONTENT
}

fn other_servers() -> Vec<SocketAddr> {
    let entries = match fs::read_dir(paths::sessions_directory()) {
        Ok(entries) => entries,
        Err(error) => {
            tracing::warn!("could not list sessions: {error}");
            return Vec::new();
        }
    };
    let own = paths::session_directory();
    let mut addresses = Vec::new();
    for entry in entries {
        let directory = match entry {
            Ok(entry) => entry.path(),
            Err(error) => {
                tracing::warn!("could not read a session: {error}");
                continue;
            }
        };
        if directory == own {
            continue;
        }
        if let Some(address) = running_server(&directory) {
            addresses.push(address);
        }
    }
    addresses
}

fn running_server(directory: &Path) -> Option<SocketAddr> {
    let lock = match File::open(directory.join(SERVER_LOCK)) {
        Ok(lock) => lock,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return None,
        Err(error) => {
            tracing::warn!(directory = %directory.display(), "could not open session lock: {error}");
            return None;
        }
    };
    match lock.try_lock_shared() {
        Ok(()) => return None,
        Err(TryLockError::WouldBlock) => {}
        Err(TryLockError::Error(error)) => {
            tracing::warn!(directory = %directory.display(), "could not check session lock: {error}");
            return None;
        }
    }
    let text = match fs::read_to_string(directory.join(SERVER_FILE)) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return None,
        Err(error) => {
            tracing::warn!(directory = %directory.display(), "could not read session address: {error}");
            return None;
        }
    };
    match serde_json::from_str::<Server>(&text) {
        Ok(server) => Some(server.address),
        Err(error) => {
            tracing::warn!(directory = %directory.display(), "invalid session address: {error}");
            None
        }
    }
}

async fn send(address: SocketAddr, secret: String) {
    let request = format!(
        "POST /api/sync HTTP/1.1\r\nHost: {address}\r\n{SECRET_HEADER}: {secret}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    let exchange = async {
        let mut stream = TcpStream::connect(address).await?;
        stream.write_all(request.as_bytes()).await?;
        let mut response = Vec::new();
        stream.read_to_end(&mut response).await?;
        Ok::<_, io::Error>(response)
    };
    match tokio::time::timeout(Duration::from_secs(2), exchange).await {
        Ok(Ok(response)) => {
            let response = String::from_utf8_lossy(&response);
            let status = response.lines().next().unwrap_or_default();
            match status.split(' ').nth(1) {
                Some("204") => tracing::debug!(%address, "notified server"),
                _ => tracing::warn!(%address, status, "server did not accept the sync"),
            }
        }
        Ok(Err(error)) => tracing::warn!(%address, "could not notify server: {error}"),
        Err(_) => tracing::warn!(%address, "timed out notifying server"),
    }
}
