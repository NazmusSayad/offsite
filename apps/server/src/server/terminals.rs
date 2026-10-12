use std::{
    collections::VecDeque,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, mpsc},
    thread,
    time::Duration,
};

use portable_pty::{Child, ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};

use super::app::App;
use crate::utils::process::current_directory;

pub(super) const HISTORY_LIMIT: usize = 2 * 1024 * 1024;

pub(super) struct Terminal {
    history: VecDeque<u8>,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    pub(super) pid: Option<u32>,
    input: mpsc::Sender<Vec<u8>>,
    pub(super) branch: Option<String>,
}

impl Terminal {
    pub(super) fn write(&self, id: u64, bytes: Vec<u8>) {
        if self.input.send(bytes).is_err() {
            tracing::warn!(id, "input dropped, the terminal's input writer has stopped");
        }
    }

    pub(super) fn resize(&self, id: u64, cols: u16, rows: u16) {
        if let Err(error) = self.master.resize(pty_size(cols, rows)) {
            tracing::warn!(id, "could not resize terminal: {error}");
        }
    }

    pub(super) fn kill(&mut self, id: u64) {
        tracing::info!(id, "killing terminal");
        if let Err(error) = self.killer.kill() {
            tracing::warn!(id, "could not kill terminal: {error}");
        }
    }

    pub(super) fn record(&mut self, bytes: &[u8]) {
        self.history.extend(bytes);
        let excess = self.history.len().saturating_sub(HISTORY_LIMIT);
        self.history.drain(..excess);
    }

    pub(super) fn history(&self) -> Vec<u8> {
        self.history.iter().copied().collect()
    }

    pub(super) fn directory(&self) -> Result<PathBuf, String> {
        match self.pid {
            Some(pid) => current_directory(pid).map_err(|error| error.to_string()),
            None => Err("its process id is unknown".to_string()),
        }
    }
}

pub(super) fn open(
    app: &Arc<App>,
    id: u64,
    command: Option<&str>,
    cwd: PathBuf,
) -> Result<Terminal, String> {
    let pair = native_pty_system()
        .openpty(pty_size(80, 24))
        .map_err(|error| error.to_string())?;
    let mut builder = shell_command(command);
    builder.cwd(&cwd);
    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");
    let child = pair
        .slave
        .spawn_command(builder)
        .map_err(|error| error.to_string())?;
    drop(pair.slave);
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    let (input, inputs) = mpsc::channel::<Vec<u8>>();
    tracing::info!(
        id,
        pid = ?child.process_id(),
        ?command,
        ?cwd,
        "terminal started"
    );
    let mut terminal = Terminal {
        history: VecDeque::new(),
        master: pair.master,
        killer: child.clone_killer(),
        pid: child.process_id(),
        input,
        branch: None,
    };
    let reading = app.clone();
    let waiting = app.clone();
    let started = thread::Builder::new()
        .spawn(move || write_input(id, writer, inputs))
        .and_then(|_| thread::Builder::new().spawn(move || read_output(id, reader, &reading)))
        .and_then(|_| thread::Builder::new().spawn(move || wait_for_exit(id, child, &waiting)));
    if let Err(error) = started {
        terminal.kill(id);
        return Err(format!("could not start the terminal's threads: {error}"));
    }
    Ok(terminal)
}

fn write_input(id: u64, mut writer: Box<dyn Write + Send>, inputs: mpsc::Receiver<Vec<u8>>) {
    for bytes in inputs {
        if let Err(error) = writer.write_all(&bytes) {
            tracing::error!(
                id,
                "could not write input to terminal, input stops here: {error}"
            );
            break;
        }
    }
    tracing::info!(id, "input writer stopped");
}

fn read_output(id: u64, mut reader: Box<dyn Read + Send>, app: &App) {
    let mut chunk = vec![0; 64 * 1024];
    loop {
        match reader.read(&mut chunk) {
            Ok(0) => {
                tracing::info!(id, "terminal output ended");
                break;
            }
            Err(error) => {
                tracing::info!(id, "terminal output ended: {error}");
                break;
            }
            Ok(length) => app.output(id, &chunk[..length]),
        }
    }
}

fn wait_for_exit(id: u64, mut child: Box<dyn Child + Send + Sync>, app: &Arc<App>) {
    match child.wait() {
        Ok(status) => tracing::info!(id, ?status, "terminal process exited"),
        Err(error) => tracing::error!(id, "could not wait for terminal process: {error}"),
    }
    app.exited(id);
}

pub(super) fn watch_branches(app: &App) {
    loop {
        thread::sleep(Duration::from_secs(1));
        for (id, pid) in app.terminal_pids() {
            let branch = current_directory(pid)
                .ok()
                .and_then(|directory| git_branch(&directory));
            app.set_branch(id, branch);
        }
    }
}

fn git_branch(directory: &Path) -> Option<String> {
    let git = directory
        .ancestors()
        .map(|folder| folder.join(".git"))
        .find(|git| git.exists())?;
    let git = match git.is_file() {
        true => {
            let text = read_small_file(&git)?;
            git.parent()?.join(text.strip_prefix("gitdir:")?.trim())
        }
        false => git,
    };
    let head = read_small_file(&git.join("HEAD"))?;
    let head = head.trim();
    match head.strip_prefix("ref: refs/heads/") {
        Some(branch) => Some(branch.to_string()),
        None => head.get(..7).map(str::to_string),
    }
}

fn read_small_file(path: &Path) -> Option<String> {
    if !fs::metadata(path).ok()?.is_file() {
        return None;
    }
    let mut text = String::new();
    File::open(path)
        .ok()?
        .take(4096)
        .read_to_string(&mut text)
        .ok()?;
    Some(text)
}

fn pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        cols,
        rows,
        pixel_width: 0,
        pixel_height: 0,
    }
}

#[cfg(unix)]
fn shell_command(command: Option<&str>) -> CommandBuilder {
    let mut builder = CommandBuilder::new("/bin/bash");
    builder.env_clear();
    for name in ["HOME", "USER", "LOGNAME", "TMPDIR", "SSH_AUTH_SOCK"] {
        if let Some(value) = std::env::var_os(name) {
            builder.env(name, value);
        }
    }
    let shell = builder.get_shell();
    builder.env("SHELL", &shell);
    builder.env("LANG", "en_US.UTF-8");
    if let Some(path) = std::env::var_os("PATH") {
        builder.env("PATH", path);
    }
    let program = match command {
        Some(program) => program.to_string(),
        None => format!("'{shell}'"),
    };
    builder.args([
        "--noprofile",
        "--norc",
        "-c",
        &format!("export -n PATH; exec -l {program}"),
    ]);
    builder
}

#[cfg(windows)]
fn shell_command(command: Option<&str>) -> CommandBuilder {
    match command {
        Some(program) => CommandBuilder::new(program),
        None => CommandBuilder::new_default_prog(),
    }
}
