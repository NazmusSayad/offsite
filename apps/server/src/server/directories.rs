use std::{fs, path::Path};

use axum::{Json, extract::Query, http::StatusCode};
use serde::{Deserialize, Serialize};

use crate::utils::paths::expand_home;

#[derive(Deserialize)]
pub(super) struct Request {
    path: String,
}

#[derive(Serialize)]
pub(super) struct Listing {
    path: String,
    parent: Option<String>,
    directories: Vec<Directory>,
}

#[derive(Serialize)]
pub(super) struct Directory {
    name: String,
    path: String,
}

pub(super) async fn list(
    Query(request): Query<Request>,
) -> Result<Json<Listing>, (StatusCode, String)> {
    let path = dunce::canonicalize(expand_home(&request.path)).map_err(|error| {
        (
            StatusCode::BAD_REQUEST,
            format!("{}: {error}", request.path),
        )
    })?;
    let entries = fs::read_dir(&path).map_err(|error| {
        (
            StatusCode::BAD_REQUEST,
            format!("{}: {error}", path.display()),
        )
    })?;
    let separator = match cfg!(windows) && request.path.contains('\\') {
        true => '\\',
        false => '/',
    };
    let base = match cfg!(windows) {
        true => request.path.trim_end_matches(['/', '\\']),
        false => request.path.trim_end_matches('/'),
    };
    let mut directories: Vec<Directory> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            Directory {
                path: format!("{base}{separator}{name}"),
                name,
            }
        })
        .collect();
    directories.sort_by_key(|directory| directory.name.to_lowercase());
    let typed = Path::new(&request.path);
    let parent = match typed.file_name().and(typed.parent()) {
        Some(parent) if parent != Path::new("") => Some(parent),
        _ => path.parent(),
    };
    Ok(Json(Listing {
        path: path.to_string_lossy().into_owned(),
        parent: parent.map(|parent| parent.to_string_lossy().into_owned()),
        directories,
    }))
}
