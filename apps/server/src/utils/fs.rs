use std::{
    ffi::OsString,
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};

use crate::utils::paths;

pub fn write_atomic(path: &Path, contents: &[u8]) -> io::Result<()> {
    let (path, temporary) = temporary_path(path)?;
    fs::write(&temporary, contents)?;
    fs::rename(&temporary, &path)
}

pub fn write_private_atomic(path: &Path, contents: &[u8]) -> io::Result<()> {
    let (path, temporary) = temporary_path(path)?;
    let mut file = File::create(&temporary)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    file.write_all(contents)?;
    drop(file);
    fs::rename(&temporary, &path)
}

fn temporary_path(path: &Path) -> io::Result<(PathBuf, OsString)> {
    let path = match fs::canonicalize(path) {
        Ok(resolved) => resolved,
        Err(error) if error.kind() == io::ErrorKind::NotFound => path.to_path_buf(),
        Err(error) => return Err(error),
    };
    fs::create_dir_all(path.parent().expect("file path has a parent directory"))?;
    let mut temporary = path.as_os_str().to_owned();
    temporary.push(".tmp");
    Ok((path, temporary))
}

pub fn lock_folder() -> io::Result<File> {
    fs::create_dir_all(paths::root())?;
    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(paths::folder_lock_file())?;
    file.lock()?;
    Ok(file)
}
