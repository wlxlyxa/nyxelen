use super::CmdResult;
use clash_verge_logging::{Type, logging};
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub path: String,
    pub connections: u32,
}

/// 列出当前有网络活动（TCP 连接）的进程
#[tauri::command]
pub async fn get_running_processes() -> CmdResult<Vec<ProcessInfo>> {
    #[cfg(windows)]
    {
        let result = tauri::async_runtime::spawn_blocking(collect_processes_windows)
            .await
            .map_err(|e| e.to_string())?;
        let count = result.as_ref().map(|v| v.len()).unwrap_or(0);
        logging!(info, Type::Cmd, "Listed {count} network processes");
        result
    }
    #[cfg(not(windows))]
    {
        Ok(Vec::new())
    }
}

#[cfg(windows)]
fn collect_processes_windows() -> CmdResult<Vec<ProcessInfo>> {
    use std::collections::HashMap;
    use windows::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, GetExtendedUdpTable, MIB_TCPTABLE_OWNER_PID, MIB_TCP6TABLE_OWNER_PID,
        MIB_UDPTABLE_OWNER_PID, TCP_TABLE_OWNER_PID_ALL, UDP_TABLE_OWNER_PID,
    };

    const AF_UNSPEC: u32 = 0;
    const AF_INET: u32 = 2;
    const AF_INET6: u32 = 23;

    // 两次调用模式：先拿 buffer 大小,再取整张表。失败返回 None（该路跳过,不影响其他路）。
    unsafe fn fetch_table_buffer(
        mut call: impl FnMut(*mut std::ffi::c_void, *mut u32) -> u32,
    ) -> Option<Vec<u8>> {
        let mut size: u32 = 0;
        call(std::ptr::null_mut(), &mut size);
        if size == 0 {
            return None;
        }
        let mut buf: Vec<u8> = vec![0u8; size as usize];
        let ret = call(buf.as_mut_ptr() as *mut std::ffi::c_void, &mut size);
        if ret != 0 {
            return None;
        }
        Some(buf)
    }

    unsafe {
        // 按 PID 聚合"网络连接/端点"总数（TCP + UDP,IPv4 + IPv6）
        let mut pid_conn: HashMap<u32, u32> = HashMap::new();

        // 路1：IPv4 TCP 连接表
        if let Some(buf) = fetch_table_buffer(|p, s| {
            GetExtendedTcpTable(Some(p), s, false, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0)
        }) {
            let table = &*(buf.as_ptr() as *const MIB_TCPTABLE_OWNER_PID);
            let rows = std::slice::from_raw_parts(table.table.as_ptr(), table.dwNumEntries as usize);
            for row in rows {
                *pid_conn.entry(row.dwOwningPid).or_insert(0) += 1;
            }
        }

        // 路2：IPv6 TCP 连接表
        if let Some(buf) = fetch_table_buffer(|p, s| {
            GetExtendedTcpTable(Some(p), s, false, AF_INET6, TCP_TABLE_OWNER_PID_ALL, 0)
        }) {
            let table = &*(buf.as_ptr() as *const MIB_TCP6TABLE_OWNER_PID);
            let rows = std::slice::from_raw_parts(table.table.as_ptr(), table.dwNumEntries as usize);
            for row in rows {
                *pid_conn.entry(row.dwOwningPid).or_insert(0) += 1;
            }
        }

        // 路3：UDP 端点表（AF_UNSPEC = IPv4 + IPv6 全部 UDP）
        if let Some(buf) = fetch_table_buffer(|p, s| {
            GetExtendedUdpTable(Some(p), s, false, AF_UNSPEC, UDP_TABLE_OWNER_PID, 0)
        }) {
            let table = &*(buf.as_ptr() as *const MIB_UDPTABLE_OWNER_PID);
            let rows = std::slice::from_raw_parts(table.table.as_ptr(), table.dwNumEntries as usize);
            for row in rows {
                *pid_conn.entry(row.dwOwningPid).or_insert(0) += 1;
            }
        }

        // 对每个 PID 取进程名/路径
        let mut processes: Vec<ProcessInfo> = Vec::new();
        for (pid, conn) in pid_conn {
            if pid == 0 {
                continue; // 跳过 System Idle Process
            }
            let path = get_process_path(pid).unwrap_or_default();
            let name = path
                .rsplit(|c| c == '\\' || c == '/')
                .next()
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue; // 权限不足拿不到名字的系统进程,跳过
            }
            processes.push(ProcessInfo { pid, name, path, connections: conn });
        }

        // 连接/端点数多的排前面
        processes.sort_by(|a, b| b.connections.cmp(&a.connections));
        Ok(processes)
    }
}

#[cfg(windows)]
fn get_process_path(pid: u32) -> Option<String> {
    use std::os::windows::ffi::OsStringExt;
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 2048];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            PWSTR(buf.as_mut_ptr()),
            &mut size,
        )
        .is_ok();
        let _ = CloseHandle(handle);
        if !ok || size == 0 {
            return None;
        }
        let os = std::ffi::OsString::from_wide(&buf[..size as usize]);
        Some(os.to_string_lossy().into_owned())
    }
}
/// 解析 Windows 快捷方式（.lnk）,返回它指向的目标 exe 路径；非 .lnk 原样返回。
#[tauri::command]
pub fn resolve_shortcut(path: String) -> CmdResult<String> {
    #[cfg(windows)]
    {
        if !path.to_lowercase().ends_with(".lnk") {
            return Ok(path);
        }
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let script = format!(
            "(New-Object -ComObject WScript.Shell).CreateShortcut('{}').TargetPath",
            path.replace('\'', "''")
        );
        let out = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("调用 PowerShell 失败: {e}"))?;
        if !out.status.success() {
            return Err(format!("解析快捷方式失败: {}", String::from_utf8_lossy(&out.stderr).trim()).into());
        }
        let target = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if target.is_empty() {
            return Err("快捷方式未指向任何目标".into());
        }
        Ok(target)
    }
    #[cfg(not(windows))]
    {
        Ok(path)
    }
}