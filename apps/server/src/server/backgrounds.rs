use std::{
    fs,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};

use super::{app::App, logos::TYPES, sync};
use crate::{config, utils::paths};

pub(super) fn delete(file: &str) {
    if let Err(error) = fs::remove_file(paths::backgrounds_directory().join(file)) {
        tracing::warn!("could not delete background {file}: {error}");
    }
}

fn store(prefix: &str, headers: &HeaderMap, body: &Bytes) -> Result<String, (StatusCode, String)> {
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok());
    let Some((_, extension)) = TYPES.iter().find(|(kind, _)| Some(*kind) == content_type) else {
        return Err((
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "background must be a PNG, JPEG, GIF, WebP, SVG or ICO image".to_string(),
        ));
    };
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock is after 1970")
        .as_millis();
    let file = format!("{prefix}-{stamp}.{extension}");
    let failed = |error: std::io::Error| (StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
    fs::create_dir_all(paths::backgrounds_directory()).map_err(failed)?;
    fs::write(paths::backgrounds_directory().join(&file), body).map_err(failed)?;
    Ok(file)
}

pub(super) async fn upload_group(
    State(app): State<Arc<App>>,
    Path(group_id): Path<u64>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, (StatusCode, String)> {
    let file = store(&group_id.to_string(), &headers, &body)?;
    match app.replace_background(group_id, Some(file.clone())) {
        Ok(Some(previous)) => delete(&previous),
        Ok(None) => {}
        Err(status) => {
            delete(&file);
            return Err((status, "group not found".to_string()));
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn remove_group(
    State(app): State<Arc<App>>,
    Path(group_id): Path<u64>,
) -> Result<StatusCode, StatusCode> {
    if let Some(previous) = app.replace_background(group_id, None)? {
        delete(&previous);
    }
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn upload(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<String, (StatusCode, String)> {
    let file = store("all", &headers, &body)?;
    let (config, previous) = match config::set_background_image(Some(file.clone())) {
        Ok(result) => result,
        Err(error) => {
            delete(&file);
            return Err(error);
        }
    };
    if let Some(previous) = previous {
        delete(&previous);
    }
    app.publish_config(&config);
    sync::notify(app.secret.clone());
    Ok(file)
}

pub(super) async fn remove(
    State(app): State<Arc<App>>,
) -> Result<StatusCode, (StatusCode, String)> {
    let (config, previous) = config::set_background_image(None)?;
    if let Some(previous) = previous {
        delete(&previous);
    }
    app.publish_config(&config);
    sync::notify(app.secret.clone());
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn serve(State(app): State<Arc<App>>, Path(file): Path<String>) -> Response {
    if !app.has_background(&file) && config::background_image().as_deref() != Some(&file) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let Some((content_type, _)) = TYPES
        .iter()
        .find(|(_, extension)| file.ends_with(&format!(".{extension}")))
    else {
        return StatusCode::NOT_FOUND.into_response();
    };
    match fs::read(paths::backgrounds_directory().join(&file)) {
        Ok(bytes) => (
            [
                (header::CONTENT_TYPE, *content_type),
                (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
            ],
            bytes,
        )
            .into_response(),
        Err(error) => (StatusCode::NOT_FOUND, error.to_string()).into_response(),
    }
}
