use std::fs;

use axum::http::StatusCode;

use crate::utils::paths;

pub(super) async fn log() -> Result<String, (StatusCode, String)> {
    fs::read_to_string(paths::log_file())
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))
}
