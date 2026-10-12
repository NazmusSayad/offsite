use std::{
    fs, io,
    sync::atomic::{AtomicBool, Ordering},
};

use portable_pty::CommandBuilder;

use crate::utils::{
    fs::{lock_folder, write_atomic},
    paths,
};

const SCRIPTS: [(&str, &str); 3] = [
    (
        "bash/sshtty.bash",
        include_str!("../shell-integration/bash/sshtty.bash"),
    ),
    (
        "zsh/.zshenv",
        include_str!("../shell-integration/zsh/.zshenv"),
    ),
    (
        "fish/vendor_conf.d/sshtty.fish",
        include_str!("../shell-integration/fish/vendor_conf.d/sshtty.fish"),
    ),
];

static INSTALLED: AtomicBool = AtomicBool::new(false);

pub(super) fn install() {
    match write_scripts() {
        Ok(()) => INSTALLED.store(true, Ordering::Relaxed),
        Err(error) => tracing::error!(
            "could not write the shell integration scripts, shells start without them: {error}"
        ),
    }
}

fn write_scripts() -> io::Result<()> {
    let _lock = lock_folder()?;
    for (name, contents) in SCRIPTS {
        let path = paths::shell_integration_directory().join(name);
        match fs::read(&path) {
            Ok(current) if current == contents.as_bytes() => continue,
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        write_atomic(&path, contents.as_bytes())?;
    }
    Ok(())
}

pub(super) fn prepare(
    builder: &mut CommandBuilder,
    command: Option<&str>,
    shell: &str,
) -> &'static str {
    if !INSTALLED.load(Ordering::Relaxed) {
        return "";
    }
    let path = match command {
        Some(command) if command.contains(char::is_whitespace) => return "",
        Some(command) => command,
        None => shell,
    };
    let directory = paths::shell_integration_directory();
    let Some(folder) = directory.to_str() else {
        tracing::warn!(?directory, "shell integration needs a UTF-8 folder path");
        return "";
    };
    match path.rsplit('/').next() {
        Some("bash") => {
            if cfg!(target_os = "macos") && (path == "/bin/bash" || !path.contains('/')) {
                return "";
            }
            let Some(home) = dirs::home_dir() else {
                return "";
            };
            let script = format!("{folder}/bash/sshtty.bash");
            let escaped: String = script
                .chars()
                .flat_map(|character| match character {
                    '\\' | '$' | '`' | '"' => vec!['\\', character],
                    character => vec![character],
                })
                .collect();
            builder.env("ENV", escaped);
            builder.env("HISTFILE", home.join(".bash_history"));
            " --posix"
        }
        Some("zsh") => {
            builder.env("ZDOTDIR", format!("{folder}/zsh"));
            ""
        }
        Some("fish") => {
            if folder.contains(':') {
                return "";
            }
            builder.env(
                "XDG_DATA_DIRS",
                format!("{folder}:/usr/local/share:/usr/share"),
            );
            ""
        }
        _ => "",
    }
}
