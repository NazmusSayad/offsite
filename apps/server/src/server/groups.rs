use std::{collections::HashSet, fs, io};

use serde::{Deserialize, Serialize};

use crate::utils::{
    fs::{is_plain_file_name, lock_folder, write_atomic},
    paths,
};

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(super) struct Groups {
    pub(super) groups: Vec<Group>,
    pub(super) next_id: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Group {
    pub(super) id: u64,
    pub(super) name: String,
    pub(super) logo: Option<String>,
    pub(super) directory: Option<String>,
    pub(super) background: Option<String>,
}

pub(super) fn read() -> Result<Groups, String> {
    let path = paths::groups_file();
    match fs::read_to_string(&path) {
        Ok(text) => {
            let mut groups: Groups = serde_json::from_str(&text)
                .map_err(|error| format!("{} is corrupt: {error}", path.display()))?;
            for group in &mut groups.groups {
                if let Some(background) = &group.background
                    && !is_plain_file_name(background)
                {
                    tracing::warn!(
                        "invalid background {background} for group {} in {}, ignoring it",
                        group.id,
                        path.display()
                    );
                    group.background = None;
                }
            }
            Ok(groups)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Groups::default()),
        Err(error) => Err(format!("could not read {}: {error}", path.display())),
    }
}

pub(super) fn update<T>(change: impl FnOnce(&mut Groups) -> T) -> Result<(Groups, T), String> {
    let _lock = lock_folder().map_err(|error| format!("could not lock the folder: {error}"))?;
    let mut groups = read()?;
    let result = change(&mut groups);
    let text = serde_json::to_vec_pretty(&groups).expect("groups serialize");
    write_atomic(&paths::groups_file(), &text)
        .map_err(|error| format!("could not save groups: {error}"))?;
    Ok((groups, result))
}

pub(super) fn unused_name<'a>(names: impl Iterator<Item = &'a String>) -> String {
    let taken: HashSet<&String> = names.collect();
    (1..)
        .map(|number: u64| number.to_string())
        .find(|name| !taken.contains(name))
        .expect("a free name exists")
}
