mod config;
mod logging;
mod server;
mod utils;

use clap::Parser;

use crate::utils::paths;

#[derive(Parser)]
#[command(version, about)]
struct Cli {
    #[arg(long, default_value = "127.0.0.1", help = "Address to listen on")]
    host: String,
    #[arg(long, default_value_t = 47831, help = "Port to listen on")]
    port: u16,
    #[arg(long, help = "Write detailed logs and serve them at /api/debug/logs")]
    debug: bool,
    #[arg(
        long,
        value_name = "DIR",
        default_value = "~/.sshtty",
        help = "Folder for settings and groups; servers with different folders are separate"
    )]
    dir: String,
}

fn main() {
    let cli = Cli::parse();
    paths::init(
        std::path::absolute(paths::expand_home(&cli.dir)).expect("could not resolve the folder"),
    );
    server::run(cli.host, cli.port, cli.debug);
}
