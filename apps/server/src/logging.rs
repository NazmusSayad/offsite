use std::{
    fs::{self, OpenOptions},
    io, process,
    sync::Mutex,
};

use tracing_subscriber::{
    filter::{LevelFilter, Targets},
    fmt,
    layer::SubscriberExt,
    util::SubscriberInitExt,
};

use crate::utils::paths;

pub fn init(debug: bool) -> io::Result<()> {
    fs::create_dir_all(paths::session_directory())?;
    let path = paths::log_file();
    let file = OpenOptions::new().create(true).append(true).open(&path)?;
    let level = match debug {
        true => LevelFilter::TRACE,
        false => LevelFilter::INFO,
    };
    let file_layer = fmt::layer()
        .with_ansi(false)
        .with_line_number(true)
        .with_writer(Mutex::new(file));
    let console_layer = fmt::layer()
        .without_time()
        .with_target(false)
        .with_writer(io::stderr);
    tracing_subscriber::registry()
        .with(
            Targets::new()
                .with_target("sshtty", level)
                .with_default(LevelFilter::WARN),
        )
        .with(file_layer)
        .with(console_layer)
        .init();
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        tracing::error!("{info}");
        default_hook(info);
    }));
    tracing::info!(pid = process::id(), level = %level, log_file = %path.display(), "logging started");
    Ok(())
}
