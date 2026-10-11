use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::{app::Tab, groups::Group};
use crate::config::Config;

#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(super) enum Request {
    Hello { client_id: String },
    Resume { client_id: String },
    Ping,
    CreateGroup,
    CreateTab { group_id: u64 },
    CloseGroup { id: u64 },
    CloseTab { id: u64 },
    RenameGroup { id: u64, name: String },
    RenameTab { id: u64, name: String },
    SetDirectory { id: u64, directory: String },
    Select { group_id: u64, tab_id: Option<u64> },
    Resize { id: u64, cols: u16, rows: u16 },
}

#[derive(Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(super) enum Event<'a> {
    Active {
        layout: Layout<'a>,
        instance: &'a str,
        branches: HashMap<u64, &'a str>,
    },
    Layout {
        layout: Layout<'a>,
    },
    Paused,
    Pong,
    Config {
        config: &'a Config,
    },
    Branch {
        id: u64,
        branch: Option<&'a str>,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Layout<'a> {
    pub(super) groups: Vec<GroupLayout<'a>>,
    pub(super) active_group: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GroupLayout<'a> {
    #[serde(flatten)]
    pub(super) group: &'a Group,
    pub(super) tabs: &'a [Tab],
    pub(super) active_tab: Option<u64>,
}
