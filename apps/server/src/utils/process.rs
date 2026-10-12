use std::{io, path::PathBuf};

#[cfg(target_os = "linux")]
pub fn current_directory(pid: u32) -> io::Result<PathBuf> {
    std::fs::read_link(format!("/proc/{pid}/cwd"))
}

#[cfg(target_os = "macos")]
pub fn current_directory(pid: u32) -> io::Result<PathBuf> {
    use std::{ffi::CStr, mem, os::unix::ffi::OsStrExt};

    let pid = libc::c_int::try_from(pid).map_err(io::Error::other)?;
    let mut info: libc::proc_vnodepathinfo = unsafe { mem::zeroed() };
    let size = mem::size_of::<libc::proc_vnodepathinfo>() as libc::c_int;
    let written = unsafe {
        libc::proc_pidinfo(
            pid,
            libc::PROC_PIDVNODEPATHINFO,
            0,
            (&raw mut info).cast(),
            size,
        )
    };
    if written != size {
        return Err(io::Error::last_os_error());
    }
    let path = unsafe { CStr::from_ptr(info.pvi_cdir.vip_path.as_ptr().cast()) };
    Ok(PathBuf::from(std::ffi::OsStr::from_bytes(path.to_bytes())))
}

#[cfg(windows)]
pub fn current_directory(_pid: u32) -> io::Result<PathBuf> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "reading the directory of another process is not supported on Windows",
    ))
}

#[cfg(target_os = "linux")]
pub fn program_name(pid: u32) -> io::Result<String> {
    Ok(std::fs::read_to_string(format!("/proc/{pid}/comm"))?
        .trim_end()
        .to_string())
}

#[cfg(target_os = "macos")]
pub fn program_name(pid: u32) -> io::Result<String> {
    let pid = libc::c_int::try_from(pid).map_err(io::Error::other)?;
    let mut name = [0_u8; 64];
    let written = unsafe { libc::proc_name(pid, name.as_mut_ptr().cast(), 64) };
    if written <= 0 {
        return Err(io::Error::last_os_error());
    }
    let length = usize::try_from(written).map_err(io::Error::other)?;
    Ok(String::from_utf8_lossy(&name[..length]).into_owned())
}

#[cfg(windows)]
pub fn child_program(pid: u32) -> io::Result<Option<String>> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
            TH32CS_SNAPPROCESS,
        },
    };

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(io::Error::last_os_error());
    }
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..PROCESSENTRY32W::default()
    };
    let mut child = None;
    let mut found = unsafe { Process32FirstW(snapshot, &raw mut entry) } != 0;
    while found {
        if entry.th32ParentProcessID == pid {
            let length = entry
                .szExeFile
                .iter()
                .position(|unit| *unit == 0)
                .unwrap_or(entry.szExeFile.len());
            child = Some(String::from_utf16_lossy(&entry.szExeFile[..length]));
            break;
        }
        found = unsafe { Process32NextW(snapshot, &raw mut entry) } != 0;
    }
    unsafe { CloseHandle(snapshot) };
    Ok(child)
}
