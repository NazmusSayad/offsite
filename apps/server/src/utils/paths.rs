use std::{
    path::PathBuf,
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};

use uuid::Uuid;

static ROOT: OnceLock<PathBuf> = OnceLock::new();
static SESSION: OnceLock<String> = OnceLock::new();

fn home_directory() -> PathBuf {
    dirs::home_dir().expect("home directory not found")
}

pub fn init(root: PathBuf) {
    let started = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock is after 1970")
        .as_millis();
    ROOT.set(root).expect("paths are initialized only once");
    SESSION
        .set(format!("{started}-{}", Uuid::new_v4()))
        .expect("paths are initialized only once");
}

pub fn root() -> PathBuf {
    ROOT.get()
        .expect("paths are initialized at startup")
        .clone()
}

pub fn session_id() -> &'static str {
    SESSION.get().expect("paths are initialized at startup")
}

pub fn config_file() -> PathBuf {
    root().join("config.json")
}

pub fn groups_file() -> PathBuf {
    root().join("groups.json")
}

pub fn folder_lock_file() -> PathBuf {
    root().join("folder.lock")
}

pub fn secret_file() -> PathBuf {
    root().join("secret")
}

pub fn push_file() -> PathBuf {
    root().join("push.json")
}

pub fn logos_directory() -> PathBuf {
    root().join("logos")
}

pub fn sessions_directory() -> PathBuf {
    root().join("sessions")
}

pub fn session_directory() -> PathBuf {
    sessions_directory().join(session_id())
}

pub fn log_file() -> PathBuf {
    session_directory().join("sshtty.log")
}

pub fn paste_directory() -> PathBuf {
    session_directory().join("paste")
}

pub fn shell_integration_directory() -> PathBuf {
    root().join("shell-integration")
}

pub fn expand_home(path: &str) -> PathBuf {
    let separators: &[char] = match cfg!(windows) {
        true => &['/', '\\'],
        false => &['/'],
    };
    match path {
        "~" => home_directory(),
        path => match path
            .strip_prefix('~')
            .and_then(|rest| rest.strip_prefix(separators))
        {
            Some(rest) => home_directory().join(rest),
            None => PathBuf::from(path),
        },
    }
}
