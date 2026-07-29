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
        GetExtendedTcpTable, MIB_TCPTABLE_OWNER_PID, TCP_TABLE_OWNER_PID_ALL,
    };

    const AF_INET: u32 = 2;

    unsafe {
        // 第一次调用拿所需 buffer 大小
        let mut size: u32 = 0;
        GetExtendedTcpTable(None, &mut size, false, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0);
        if size == 0 {
            return Ok(Vec::new());
        }

        // 分配 buffer 再取整张 TCP 连接表
        let mut buf: Vec<u8> = vec![0u8; size as usize];
        let ret = GetExtendedTcpTable(
            Some(buf.as_mut_ptr() as *mut std::ffi::c_void),
            &mut size,
            false,
            AF_INET,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        );
        if ret != 0 {
            return Err(format!("GetExtendedTcpTable failed with code {ret}").into());
        }

        let table = &*(buf.as_ptr() as *const MIB_TCPTABLE_OWNER_PID);
        let num = table.dwNumEntries as usize;
        let rows = std::slice::from_raw_parts(table.table.as_ptr(), num);

        // 按 PID 聚合连接数
        let mut pid_conn: HashMap<u32, u32> = HashMap::new();
        for row in rows {
            *pid_conn.entry(row.dwOwningPid).or_insert(0) += 1;
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
                continue; // 权限不足拿不到名字的系统进程，跳过
            }
            processes.push(ProcessInfo { pid, name, path, connections: conn });
        }

        // 连接数多的排前面
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
