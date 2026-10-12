use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

use axum::{Json, http::StatusCode};
use portable_pty::CommandBuilder;
use serde::{Deserialize, Serialize};

use crate::utils::{
    fs::{lock_folder, write_atomic},
    paths::{self, expand_home},
};

const DEFAULT: &str = include_str!("default-config.json");
const THEMES: &str = include_str!("themes.json");
const CUSTOM_THEME: &str = "custom";
const ITERM2_VERSION: &str = "3.6.8";

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Config {
    shell: Shells,
    font: Font,
    cursor: Cursor,
    padding: Padding,
    scrollback: u32,
    theme: Theme,
    empty_screen_animation: bool,
    #[serde(default)]
    behavior: Behavior,
}

#[derive(Serialize, Deserialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
struct Behavior {
    modernize_shift_enter: bool,
    paste_browser_images: bool,
    show_git_branch: bool,
    capture_shortcuts: bool,
    bell_flash: bool,
    bell_sound: bool,
    terminal_identity: TerminalIdentity,
    shell_integration: bool,
    command_marks: bool,
    click_to_move_cursor: bool,
    macos_editing_keys: bool,
    option_as_meta: OptionAsMeta,
    clipboard_read: ClipboardRead,
    confirm_close_busy_tab: bool,
    background_image: Option<String>,
    background_opacity: f64,
    background_fit: BackgroundFit,
    activity_marks: bool,
    agent_status: bool,
}

impl Default for Behavior {
    fn default() -> Self {
        Behavior {
            modernize_shift_enter: true,
            paste_browser_images: true,
            show_git_branch: true,
            capture_shortcuts: true,
            bell_flash: true,
            bell_sound: true,
            terminal_identity: TerminalIdentity::Sshtty,
            shell_integration: true,
            command_marks: true,
            click_to_move_cursor: true,
            macos_editing_keys: true,
            option_as_meta: OptionAsMeta::Off,
            clipboard_read: ClipboardRead::Ask,
            confirm_close_busy_tab: true,
            background_image: None,
            background_opacity: 0.3,
            background_fit: BackgroundFit::Cover,
            activity_marks: true,
            agent_status: true,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum TerminalIdentity {
    Sshtty,
    Iterm2,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum OptionAsMeta {
    Off,
    Left,
    Right,
    Both,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ClipboardRead {
    Ask,
    Allow,
    Deny,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum BackgroundFit {
    Cover,
    Contain,
    Tile,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Shells {
    macos: Shell,
    linux: Shell,
    windows: Shell,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Shell {
    command: Option<String>,
    cwd: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Font {
    family: String,
    size: f64,
    line_height: f64,
    ligatures: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Cursor {
    style: CursorStyle,
    blink: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum CursorStyle {
    Block,
    Bar,
    Underline,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Padding {
    top: u32,
    right: u32,
    bottom: u32,
    left: u32,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Theme {
    name: String,
    bold_is_bright: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    colors: Option<Colors>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Colors {
    background: String,
    foreground: String,
    cursor: String,
    cursor_text: String,
    selection_background: String,
    selection_foreground: String,
    palette: [String; 16],
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BuiltinTheme {
    id: String,
    name: String,
    colors: Colors,
}

pub struct Launch {
    pub command: Option<String>,
    pub cwd: PathBuf,
    pub environment: [(&'static str, &'static str); 4],
    pub shell_integration: bool,
}

pub fn version() -> &'static str {
    match option_env!("SSHTTY_VERSION") {
        Some(tag) => tag.trim_start_matches('v'),
        None => env!("CARGO_PKG_VERSION"),
    }
}

pub fn default_shell() -> String {
    let mut builder = CommandBuilder::new_default_prog();
    builder.env_clear();
    builder.get_shell()
}

pub fn create() -> io::Result<()> {
    fs::create_dir_all(paths::root())?;
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(paths::config_file())
    {
        Ok(mut file) => file.write_all(DEFAULT.as_bytes()),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Ok(()),
        Err(error) => Err(error),
    }
}

fn builtin_themes() -> Vec<BuiltinTheme> {
    serde_json::from_str(THEMES).expect("built-in themes are valid")
}

fn validate(config: &Config) -> Result<(), String> {
    let behavior = &config.behavior;
    if !(0.0..=1.0).contains(&behavior.background_opacity) {
        return Err("the background opacity must be between 0 and 1".to_string());
    }
    if let Some(file) = &behavior.background_image
        && (file.contains(['/', '\\']) || file.starts_with('.'))
    {
        return Err(format!("invalid background image {file}"));
    }
    let theme = &config.theme;
    if theme.name == CUSTOM_THEME {
        if theme.colors.is_none() {
            return Err("the custom theme needs colors".to_string());
        }
    } else if !builtin_themes()
        .iter()
        .any(|builtin| builtin.id == theme.name)
    {
        return Err(format!("unknown theme {}", theme.name));
    }
    match &theme.colors {
        Some(colors) => validate_colors(colors),
        None => Ok(()),
    }
}

fn validate_colors(colors: &Colors) -> Result<(), String> {
    let named = [
        &colors.background,
        &colors.foreground,
        &colors.cursor,
        &colors.cursor_text,
        &colors.selection_background,
        &colors.selection_foreground,
    ];
    for color in named.into_iter().chain(&colors.palette) {
        let valid = color.len() == 7
            && color.starts_with('#')
            && color[1..]
                .chars()
                .all(|character| character.is_ascii_hexdigit());
        if !valid {
            return Err(format!("color {color} must look like #RRGGBB"));
        }
    }
    Ok(())
}

fn parse(value: &serde_json::Value) -> Result<Config, String> {
    let config: Config =
        serde_json::from_value(value.clone()).map_err(|error| error.to_string())?;
    validate(&config)?;
    Ok(config)
}

fn merge(
    config: &mut serde_json::Value,
    keys: &mut Vec<String>,
    user: &serde_json::Value,
    path: &Path,
) {
    let group = matches!(
        keys.iter().try_fold(&*config, |value, key| value.get(key)),
        Some(serde_json::Value::Object(_))
    );
    if let (true, serde_json::Value::Object(items)) = (group, user) {
        for (key, item) in items {
            keys.push(key.clone());
            merge(config, keys, item, path);
            keys.pop();
        }
        return;
    }
    let mut candidate = config.clone();
    let (key, parents) = keys.split_last().expect("an item has a key");
    let parent = parents
        .iter()
        .fold(&mut candidate, |value, parent| &mut value[parent]);
    parent[key] = user.clone();
    match serde_json::from_value::<Config>(candidate.clone()) {
        Ok(_) => *config = candidate,
        Err(error) => tracing::warn!(
            "invalid {} in {}, using its default: {error}",
            keys.join("."),
            path.display()
        ),
    }
}

pub fn read() -> Config {
    let path = paths::config_file();
    let defaults: serde_json::Value =
        serde_json::from_str(DEFAULT).expect("default config is valid");
    let user = match fs::read_to_string(&path) {
        Ok(text) => match serde_json::from_str::<serde_json::Value>(&text) {
            Ok(serde_json::Value::Object(user)) => user,
            Ok(_) => {
                tracing::warn!(
                    "{} is not an object, using the default config",
                    path.display()
                );
                serde_json::Map::new()
            }
            Err(error) => {
                tracing::warn!(
                    "invalid {}, using the default config: {error}",
                    path.display()
                );
                serde_json::Map::new()
            }
        },
        Err(error) => {
            tracing::warn!(
                "could not read {}, using the default config: {error}",
                path.display()
            );
            serde_json::Map::new()
        }
    };
    let mut value = defaults.clone();
    for key in defaults
        .as_object()
        .expect("default config is an object")
        .keys()
    {
        let Some(section) = user.get(key) else {
            continue;
        };
        let mut candidate = value.clone();
        merge(&mut candidate, &mut vec![key.clone()], section, &path);
        match parse(&candidate) {
            Ok(_) => value = candidate,
            Err(error) => {
                tracing::warn!(
                    "invalid {key} in {}, using its default: {error}",
                    path.display()
                )
            }
        }
    }
    parse(&value).expect("merged config is valid")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    config: Config,
    defaults: Config,
    themes: Vec<BuiltinTheme>,
    platform: &'static str,
    version: &'static str,
    default_shell: String,
}

pub async fn handler() -> Json<Settings> {
    Json(Settings {
        config: read(),
        defaults: serde_json::from_str(DEFAULT).expect("default config is valid"),
        themes: builtin_themes(),
        platform: std::env::consts::OS,
        version: version(),
        default_shell: default_shell(),
    })
}

pub fn save(config: Config) -> Result<Config, (StatusCode, String)> {
    validate(&config).map_err(|error| (StatusCode::BAD_REQUEST, error))?;
    let mut text = serde_json::to_string_pretty(&config).expect("config serializes");
    text.push('\n');
    let failed = |error: io::Error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
    let _lock = lock_folder().map_err(failed)?;
    write_atomic(&paths::config_file(), text.as_bytes()).map_err(failed)?;
    Ok(config)
}

pub fn background_image() -> Option<String> {
    read().behavior.background_image
}

pub fn set_background_image(
    file: Option<String>,
) -> Result<(Config, Option<String>), (StatusCode, String)> {
    let mut config = read();
    let previous = std::mem::replace(&mut config.behavior.background_image, file);
    Ok((save(config)?, previous))
}

pub fn launch(directory: Option<&str>) -> Result<Launch, String> {
    let config = read();
    let shells = config.shell;
    let shell = match std::env::consts::OS {
        "macos" => shells.macos,
        "linux" => shells.linux,
        "windows" => shells.windows,
        other => return Err(format!("unsupported platform {other}")),
    };
    let (program, terminal, version) = match config.behavior.terminal_identity {
        TerminalIdentity::Sshtty => ("sshtty", "sshtty", version()),
        TerminalIdentity::Iterm2 => ("iTerm.app", "iTerm2", ITERM2_VERSION),
    };
    Ok(Launch {
        command: shell.command,
        cwd: dunce::simplified(&expand_home(match directory {
            Some(directory) => directory,
            None => &shell.cwd,
        }))
        .to_path_buf(),
        environment: [
            ("TERM_PROGRAM", program),
            ("TERM_PROGRAM_VERSION", version),
            ("LC_TERMINAL", terminal),
            ("LC_TERMINAL_VERSION", version),
        ],
        shell_integration: config.behavior.shell_integration,
    })
}
