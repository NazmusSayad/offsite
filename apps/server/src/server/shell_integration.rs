use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::Path,
};

use portable_pty::CommandBuilder;

use crate::utils::{fs::lock_folder, paths};

const BASH: &str = include_str!("../shell-integration/bash/sshtty.bash");
const ZSH: &str = include_str!("../shell-integration/zsh/.zshenv");
const FISH: &str = include_str!("../shell-integration/fish/sshtty.fish");

pub(super) fn prepare(
    builder: &mut CommandBuilder,
    command: Option<&str>,
    shell: &str,
) -> Option<String> {
    let (path, program, arguments) = match command {
        Some(command) => {
            if command.contains(|character| "\n\"'\\$`;&|<>()*?[]{}#!".contains(character)) {
                return None;
            }
            let mut words = command.split([' ', '\t']).filter(|word| !word.is_empty());
            let path = words.next()?;
            (path, path.to_string(), words.collect::<Vec<_>>())
        }
        None => (shell, format!("'{shell}'"), Vec::new()),
    };
    let directory = paths::shell_integration_directory();
    let Some(folder) = directory.to_str() else {
        tracing::warn!(?directory, "shell integration needs a UTF-8 folder path");
        return None;
    };
    let integration = match path.rsplit('/').next() {
        Some("bash") => {
            if cfg!(target_os = "macos") && (path == "/bin/bash" || !path.contains('/')) {
                return None;
            }
            if !arguments
                .iter()
                .all(|argument| matches!(*argument, "-l" | "--login" | "-i"))
            {
                return None;
            }
            let home = std::env::var_os("HOME").filter(|home| !home.is_empty())?;
            let script = format!("{folder}/bash/sshtty.bash");
            write_script(&script, BASH)?;
            let escaped: String = script
                .chars()
                .flat_map(|character| match character {
                    '\\' | '$' | '`' | '"' => vec!['\\', character],
                    character => vec![character],
                })
                .collect();
            builder.env("ENV", escaped);
            builder.env("HISTFILE", Path::new(&home).join(".bash_history"));
            " --posix".to_string()
        }
        Some("zsh") => {
            let mut words = arguments.iter();
            while let Some(word) = words.next() {
                let enable = match word.chars().next() {
                    Some('-') => true,
                    Some('+') => false,
                    _ => return None,
                };
                let flags = &word[1..];
                if flags.is_empty() || flags == "-" {
                    return None;
                }
                if let Some(name) = flags.strip_prefix('-') {
                    if !zsh_option_allowed(name, enable) {
                        return None;
                    }
                    continue;
                }
                for (index, letter) in flags.char_indices() {
                    match letter {
                        'o' => {
                            let name = match &flags[index + 1..] {
                                "" => words.next()?,
                                name => name,
                            };
                            if !zsh_option_allowed(name, enable) {
                                return None;
                            }
                            break;
                        }
                        'b' | 'c' => return None,
                        'd' | 'f' | 'n' | 'p' | 'r' | 'v' | 'x' if enable => return None,
                        'i' if !enable => return None,
                        _ => {}
                    }
                }
            }
            for global in ["/etc/zshenv", "/etc/zsh/zshenv"] {
                match fs::read_to_string(global) {
                    Ok(contents) => {
                        for line in contents.lines() {
                            let line = line.trim_start();
                            if line.starts_with('#') {
                                continue;
                            }
                            let normalized = line.to_lowercase().replace('_', "");
                            if [
                                "zdotdir",
                                "rcs",
                                "emulate",
                                "debug",
                                "xtrace",
                                "verbose",
                                "sourcetrace",
                            ]
                            .iter()
                            .any(|word| normalized.contains(word))
                            {
                                return None;
                            }
                            let mut setting = false;
                            for word in line.split([' ', '\t', ';', '&', '|']) {
                                if word.is_empty() {
                                    continue;
                                }
                                if matches!(word, "set" | "setopt" | "unsetopt") {
                                    setting = true;
                                    continue;
                                }
                                let flag = word.starts_with('-') || word.starts_with('+');
                                if setting && flag && word.contains(['f', 'x', 'v']) {
                                    return None;
                                }
                                if !flag {
                                    setting = false;
                                }
                            }
                        }
                    }
                    Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                    Err(error) => {
                        tracing::warn!(
                            "could not read {global}, zsh starts without shell integration: {error}"
                        );
                        return None;
                    }
                }
            }
            let home = dirs::home_dir()?;
            if [".zshenv", ".zprofile", ".zshrc", ".zlogin"]
                .iter()
                .all(|name| !home.join(name).exists())
            {
                return None;
            }
            write_script(&format!("{folder}/zsh/.zshenv"), ZSH)?;
            builder.env("ZDOTDIR", format!("{folder}/zsh"));
            String::new()
        }
        Some("fish") => {
            let supported = arguments.iter().all(|argument| {
                if let Some(name) = argument.strip_prefix("--") {
                    let name = match name.split_once('=') {
                        Some((name, _)) => name,
                        None => name,
                    };
                    return name.is_empty()
                        || !["command", "no-config", "no-execute"]
                            .iter()
                            .any(|option| option.starts_with(name));
                }
                !(argument.starts_with('-') && argument.contains(['c', 'N', 'n']))
            });
            if !supported {
                return None;
            }
            let script = format!("{folder}/fish/sshtty.fish");
            write_script(&script, FISH)?;
            let source = format!(
                "source '{}'",
                script.replace('\\', "\\\\").replace('\'', "\\'")
            );
            format!(" --init-command '{}'", source.replace('\'', "'\\''"))
        }
        _ => return None,
    };
    let mut line = format!("{program}{integration}");
    for argument in arguments {
        line.push(' ');
        line.push_str(argument);
    }
    Some(line)
}

fn zsh_option_allowed(name: &str, enable: bool) -> bool {
    let name = name.to_lowercase().replace(['-', '_'], "");
    let (name, enable) = match name.strip_prefix("no") {
        Some(name) => (name, !enable),
        None => (name.as_str(), enable),
    };
    !matches!(
        (name, enable),
        ("rcs" | "globalrcs" | "interactive" | "exec", false)
            | (
                "privileged" | "restricted" | "sourcetrace" | "verbose" | "xtrace",
                true
            )
    )
}

fn write_script(path: &str, contents: &str) -> Option<()> {
    match replace_script(Path::new(path), contents) {
        Ok(()) => Some(()),
        Err(error) => {
            tracing::warn!(
                "could not write {path}, the shell starts without shell integration: {error}"
            );
            None
        }
    }
}

fn replace_script(path: &Path, contents: &str) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && fs::read(path)? == contents.as_bytes() => {
            return Ok(());
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    let _lock = lock_folder()?;
    fs::create_dir_all(path.parent().expect("script path has a parent directory"))?;
    let mut temporary = path.as_os_str().to_owned();
    temporary.push(".tmp");
    match fs::remove_file(&temporary) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?
        .write_all(contents.as_bytes())?;
    fs::rename(&temporary, path)
}
