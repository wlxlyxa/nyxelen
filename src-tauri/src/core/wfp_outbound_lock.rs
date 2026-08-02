//! Nyxelen · 物理网卡出站锁 · WFP sublayer 权重方案
//! 后端 + 白名单 V4 地址段 permit 版。
//! 动态 session：关 engine 即清所有 sublayer+filter。

use core::ffi::c_void;
use std::sync::Mutex;

use windows::core::{GUID, HSTRING, PWSTR};
use windows::Win32::Foundation::{HANDLE, NTSTATUS};
use windows::Win32::NetworkManagement::WindowsFilteringPlatform::{
    FWPM_DISPLAY_DATA0, FWPM_FILTER0, FWPM_FILTER_CONDITION0, FWPM_SESSION0, FWPM_SUBLAYER0,
    FWP_BYTE_BLOB, FWP_V4_ADDR_AND_MASK, FWP_ACTION_BLOCK, FWP_ACTION_PERMIT, FWP_BYTE_BLOB_TYPE,
    FWP_DATA_TYPE, FWP_MATCH_EQUAL, FWP_UINT64, FWP_V4_ADDR_MASK, FWPM_CONDITION_ALE_APP_ID,
    FWPM_CONDITION_INTERFACE_INDEX, FWPM_CONDITION_IP_REMOTE_ADDRESS, FWPM_LAYER_ALE_AUTH_CONNECT_V4,
    FWPM_LAYER_ALE_AUTH_CONNECT_V6, FWPM_SESSION_FLAG_DYNAMIC, FwpmFreeMemory0, FwpmGetAppIdFromFileName0,
};
use windows::Wdk::NetworkManagement::WindowsFilteringPlatform::{
    FwpmEngineClose0, FwpmEngineOpen0, FwpmFilterAdd0, FwpmSubLayerAdd0, FwpmSubLayerDeleteByKey0,
};

const NYXELEN_SUBLAYER_KEY: GUID = GUID {
    data1: 0x9f8e_7d6c,
    data2: 0x5b4a,
    data3: 0x3928,
    data4: [0x17, 0x06, 0xf5, 0xe4, 0xd3, 0xc2, 0xb1, 0xa0],
};
const RPC_C_AUTHN_DEFAULT: u32 = 0xFFFF_FFFF;
const FWP_UINT32: FWP_DATA_TYPE = FWP_DATA_TYPE(3);

/// V4 白名单地址段：(addr 四元组, mask 四元组)。回环 + 私网三段 + 链路本地。
/// 让物理锁在系统代理模式下不误伤局域网/路由器/本机回环。
const LAN_PERMIT_V4: [([u8; 4], [u8; 4]); 5] = [
    ([127, 0, 0, 0], [255, 0, 0, 0]),       // 回环
    ([10, 0, 0, 0], [255, 0, 0, 0]),        // 10/8
    ([172, 16, 0, 0], [255, 240, 0, 0]),    // 172.16/12
    ([192, 168, 0, 0], [255, 255, 0, 0]),   // 192.168/16
    ([169, 254, 0, 0], [255, 255, 0, 0]),   // 链路本地
];

/// 四元组 → u32。
/// ⚠️ 字节序首试 = little-endian（与 Winsock in_addr.s_addr 惯例一致）。
/// 若 TUN 关干净后访问局域网仍不通，把 from_le_bytes 改成 from_be_bytes 重试一次（仅此一处）。
fn v4u32(b: [u8; 4]) -> u32 {
    u32::from_le_bytes(b)
}

fn nt_ok(s: NTSTATUS, what: &str) -> Result<(), String> {
    if s.0 < 0 {
        Err(format!("{} 失败: 0x{:08X}", what, s.0 as u32))
    } else {
        Ok(())
    }
}

pub fn wfp_selftest() -> Result<String, String> {
    unsafe {
        let mut engine = HANDLE::default();
        nt_ok(FwpmEngineOpen0(None, RPC_C_AUTHN_DEFAULT, None, None, &mut engine), "FwpmEngineOpen0")?;
        let name = HSTRING::from("Nyxelen Outbound Lock");
        let desc = HSTRING::from("selftest");
        let mut sl = FWPM_SUBLAYER0::default();
        sl.subLayerKey = NYXELEN_SUBLAYER_KEY;
        sl.displayData = FWPM_DISPLAY_DATA0 {
            name: PWSTR(name.as_ptr() as *mut _),
            description: PWSTR(desc.as_ptr() as *mut _),
        };
        sl.weight = 0xFFFF;
        let _ = FwpmSubLayerDeleteByKey0(engine, &NYXELEN_SUBLAYER_KEY);
        if let Err(e) = nt_ok(FwpmSubLayerAdd0(engine, &sl, None), "FwpmSubLayerAdd0") {
            let _ = FwpmEngineClose0(engine);
            return Err(e);
        }
        if let Err(e) = nt_ok(FwpmSubLayerDeleteByKey0(engine, &NYXELEN_SUBLAYER_KEY), "FwpmSubLayerDeleteByKey0") {
            let _ = FwpmEngineClose0(engine);
            return Err(e);
        }
        let _ = FwpmEngineClose0(engine);
        Ok("WFP 自检通过".into())
    }
}

struct EngineHandle(HANDLE);
unsafe impl Send for EngineHandle {}
unsafe impl Sync for EngineHandle {}

static ENGINE: Mutex<Option<EngineHandle>> = Mutex::new(None);

pub fn enable_physical_nic_lock(proxy_exe: Option<String>, nic_indices: Vec<u32>) -> Result<String, String> {
    {
        let g = ENGINE.lock().map_err(|e| format!("锁状态失败: {e}"))?;
        if g.is_some() {
            return Err("物理网卡锁已启用，请先解除".into());
        }
    }
    if nic_indices.is_empty() {
        return Err("未指定物理网卡索引".into());
    }
    let exe_path = proxy_exe
        .or_else(crate::core::firewall_allow::current_core_exe_path)
        .ok_or_else(|| "代理内核未运行，无法解析白名单路径（请先启动代理）".to_string())?;
    unsafe {
        let exe_w = HSTRING::from(&exe_path);
        let mut app_id: *mut FWP_BYTE_BLOB = std::ptr::null_mut();
        let r = FwpmGetAppIdFromFileName0(&exe_w, &mut app_id);
        if r != 0 || app_id.is_null() {
            return Err(format!("解析代理 exe 的 app id 失败（win32 err={}, 路径={}）", r, exe_path));
        }

        let mut session = FWPM_SESSION0::default();
        session.flags = FWPM_SESSION_FLAG_DYNAMIC;
        let mut engine = HANDLE::default();
        let s = FwpmEngineOpen0(None, RPC_C_AUTHN_DEFAULT, None, Some(&session as *const _), &mut engine);
        if s.0 < 0 {
            FwpmFreeMemory0(&mut app_id as *mut *mut FWP_BYTE_BLOB as *mut *mut c_void);
            return Err(format!("FwpmEngineOpen0 失败: 0x{:08X}", s.0 as u32));
        }

        let sl_name = HSTRING::from("Nyxelen Outbound Lock");
        let sl_desc = HSTRING::from("Physical NIC outbound lock");
        let mut sl = FWPM_SUBLAYER0::default();
        sl.subLayerKey = NYXELEN_SUBLAYER_KEY;
        sl.displayData = FWPM_DISPLAY_DATA0 {
            name: PWSTR(sl_name.as_ptr() as *mut _),
            description: PWSTR(sl_desc.as_ptr() as *mut _),
        };
        sl.weight = 0xFFFF;
        if let Err(e) = nt_ok(FwpmSubLayerAdd0(engine, &sl, None), "FwpmSubLayerAdd0") {
            let _ = FwpmEngineClose0(engine);
            FwpmFreeMemory0(&mut app_id as *mut *mut FWP_BYTE_BLOB as *mut *mut c_void);
            return Err(e);
        }

        let mut w_permit: u64 = 0x0000_FFFF_0000_0000;
        let mut w_block: u64 = 0x0000_1000_0000_0000;
        let nm_permit = HSTRING::from("Nyxelen-physlock-permit-app");
        let nm_lan = HSTRING::from("Nyxelen-physlock-permit-lan");
        let nm_block = HSTRING::from("Nyxelen-physlock-block-nic");
        let layers = [FWPM_LAYER_ALE_AUTH_CONNECT_V4, FWPM_LAYER_ALE_AUTH_CONNECT_V6];

        // permit-app（V4+V6）
        let mut cond_app = FWPM_FILTER_CONDITION0::default();
        cond_app.fieldKey = FWPM_CONDITION_ALE_APP_ID;
        cond_app.matchType = FWP_MATCH_EQUAL;
        cond_app.conditionValue.r#type = FWP_BYTE_BLOB_TYPE;
        cond_app.conditionValue.Anonymous.byteBlob = app_id;
        for layer in layers {
            let mut f = FWPM_FILTER0::default();
            f.layerKey = layer;
            f.subLayerKey = NYXELEN_SUBLAYER_KEY;
            f.weight.r#type = FWP_UINT64;
            f.weight.Anonymous.uint64 = &mut w_permit;
            f.displayData = FWPM_DISPLAY_DATA0 {
                name: PWSTR(nm_permit.as_ptr() as *mut _),
                description: PWSTR(std::ptr::null_mut()),
            };
            f.numFilterConditions = 1;
            f.filterCondition = &mut cond_app as *mut _;
            f.action.r#type = FWP_ACTION_PERMIT;
            if let Err(e) = nt_ok(FwpmFilterAdd0(engine, &f, None, None), "加 permit-app filter") {
                let _ = FwpmEngineClose0(engine);
                FwpmFreeMemory0(&mut app_id as *mut *mut FWP_BYTE_BLOB as *mut *mut c_void);
                return Err(e);
            }
        }

        // permit-lan（仅 V4：v4AddrMask 是 V4 条件，V6 层加无意义；V6 局域网极少，留作已知未补）
        let nm_lan_ptr = PWSTR(nm_lan.as_ptr() as *mut _);
        for (addr, mask) in LAN_PERMIT_V4 {
            let mut am = FWP_V4_ADDR_AND_MASK { addr: v4u32(addr), mask: v4u32(mask) };
            let mut cond_lan = FWPM_FILTER_CONDITION0::default();
            cond_lan.fieldKey = FWPM_CONDITION_IP_REMOTE_ADDRESS;
            cond_lan.matchType = FWP_MATCH_EQUAL;
            cond_lan.conditionValue.r#type = FWP_V4_ADDR_MASK;
            cond_lan.conditionValue.Anonymous.v4AddrMask = &mut am;
            let mut f = FWPM_FILTER0::default();
            f.layerKey = FWPM_LAYER_ALE_AUTH_CONNECT_V4;
            f.subLayerKey = NYXELEN_SUBLAYER_KEY;
            f.weight.r#type = FWP_UINT64;
            f.weight.Anonymous.uint64 = &mut w_permit;
            f.displayData = FWPM_DISPLAY_DATA0 {
                name: nm_lan_ptr,
                description: PWSTR(std::ptr::null_mut()),
            };
            f.numFilterConditions = 1;
            f.filterCondition = &mut cond_lan as *mut _;
            f.action.r#type = FWP_ACTION_PERMIT;
            if let Err(e) = nt_ok(FwpmFilterAdd0(engine, &f, None, None), &format!("加 permit-lan filter({:?})", addr)) {
                let _ = FwpmEngineClose0(engine);
                FwpmFreeMemory0(&mut app_id as *mut *mut FWP_BYTE_BLOB as *mut *mut c_void);
                return Err(e);
            }
        }

        // block-nic（V4+V6）
        for &idx in &nic_indices {
            let mut cond_if = FWPM_FILTER_CONDITION0::default();
            cond_if.fieldKey = FWPM_CONDITION_INTERFACE_INDEX;
            cond_if.matchType = FWP_MATCH_EQUAL;
            cond_if.conditionValue.r#type = FWP_UINT32;
            cond_if.conditionValue.Anonymous.uint32 = idx;
            for layer in layers {
                let mut f = FWPM_FILTER0::default();
                f.layerKey = layer;
                f.subLayerKey = NYXELEN_SUBLAYER_KEY;
                f.weight.r#type = FWP_UINT64;
                f.weight.Anonymous.uint64 = &mut w_block;
                f.displayData = FWPM_DISPLAY_DATA0 {
                    name: PWSTR(nm_block.as_ptr() as *mut _),
                    description: PWSTR(std::ptr::null_mut()),
                };
                f.numFilterConditions = 1;
                f.filterCondition = &mut cond_if as *mut _;
                f.action.r#type = FWP_ACTION_BLOCK;
                if let Err(e) = nt_ok(FwpmFilterAdd0(engine, &f, None, None), &format!("加 block-nic filter(idx={})", idx)) {
                    let _ = FwpmEngineClose0(engine);
                    FwpmFreeMemory0(&mut app_id as *mut *mut FWP_BYTE_BLOB as *mut *mut c_void);
                    return Err(e);
                }
            }
        }

        FwpmFreeMemory0(&mut app_id as *mut *mut FWP_BYTE_BLOB as *mut *mut c_void);
        let mut g = ENGINE.lock().map_err(|e| format!("锁状态失败: {e}"))?;
        *g = Some(EngineHandle(engine));
        Ok(format!("物理网卡锁已启用：permit-app + permit-lan(5段) + block-nic({:?})，V4+V6", nic_indices))
    }
}

pub fn disable_physical_nic_lock() -> Result<String, String> {
    let mut g = ENGINE.lock().map_err(|e| format!("锁状态失败: {e}"))?;
    match g.take() {
        Some(EngineHandle(engine)) => unsafe {
            let _ = FwpmEngineClose0(engine);
            Ok("物理网卡锁已解除（动态 session 关闭，规则全清）".into())
        },
        None => Ok("物理网卡锁本就未启用".into()),
    }
}

#[derive(serde::Serialize)]
pub struct PhysicalNic {
    pub name: String,
    pub index: u32,
}

pub fn list_physical_nics_indexed() -> Result<Vec<PhysicalNic>, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let out = Command::new("powershell")
        .args([
            "-NoProfile", "-NonInteractive", "-Command",
            "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | ForEach-Object { \"$($_.Name)|$($_.ifIndex)\" }",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("调用 PowerShell 失败: {e}"))?;
    let s = String::from_utf8_lossy(&out.stdout);
    Ok(s.lines()
        .filter_map(|line| {
            let mut it = line.trim().rsplitn(2, '|');
            let index = it.next()?.trim().parse::<u32>().ok()?;
            let name = it.next()?.trim().to_string();
            (!name.is_empty()).then_some(PhysicalNic { name, index })
        })
        .collect())
}

pub fn is_physical_nic_locked() -> bool {
    ENGINE.lock().map(|g| g.is_some()).unwrap_or(false)
}

#[tauri::command]
pub fn wfp_lock_selftest() -> Result<String, String> {
    wfp_selftest()
}
#[tauri::command]
pub fn enable_physical_nic_lock_cmd(proxy_exe: Option<String>, nic_indices: Vec<u32>) -> Result<String, String> {
    enable_physical_nic_lock(proxy_exe, nic_indices)
}
#[tauri::command]
pub fn disable_physical_nic_lock_cmd() -> Result<String, String> {
    disable_physical_nic_lock()
}
#[tauri::command]
pub fn list_physical_nics_indexed_cmd() -> Result<Vec<PhysicalNic>, String> {
    list_physical_nics_indexed()
}
#[tauri::command]
pub fn is_physical_nic_locked_cmd() -> bool {
    is_physical_nic_locked()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wfp_selftest_runs() {
        let r = wfp_selftest();
        println!("=== selftest: {:?} ===", r);
        assert!(r.is_ok());
    }

    #[test]
    fn enable_disable_minimal() {
        let exe = std::env::current_exe().unwrap().to_string_lossy().into_owned();
        let r = enable_physical_nic_lock(Some(exe), vec![99999]);
        println!("=== enable: {:?} ===", r);
        assert!(r.is_ok(), "enable 失败: {:?}", r);
        let r2 = disable_physical_nic_lock();
        println!("=== disable: {:?} ===", r2);
        assert!(r2.is_ok(), "disable 失败: {:?}", r2);
    }
}