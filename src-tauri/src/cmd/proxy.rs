use super::CmdResult;
use crate::config::Config;
use crate::core::tray::Tray;
use crate::process::AsyncHandler;
use clash_verge_logging::{Type, logging};
use std::sync::atomic::{AtomicBool, Ordering};

static TRAY_SYNC_RUNNING: AtomicBool = AtomicBool::new(false);
static TRAY_SYNC_PENDING: AtomicBool = AtomicBool::new(false);

/// 同步托盘和GUI的代理选择状态
#[tauri::command]
pub async fn sync_tray_proxy_selection() -> CmdResult<()> {
    if TRAY_SYNC_RUNNING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_ok()
    {
        AsyncHandler::spawn(move || async move {
            run_tray_sync_loop().await;
        });
    } else {
        TRAY_SYNC_PENDING.store(true, Ordering::Release);
    }

    Ok(())
}

async fn run_tray_sync_loop() {
    loop {
        match Tray::global().update_menu().await {
            Ok(_) => {
                logging!(info, Type::Cmd, "Tray proxy selection synced successfully");
            }
            Err(e) => {
                logging!(error, Type::Cmd, "Failed to sync tray proxy selection: {e}");
            }
        }

        if !TRAY_SYNC_PENDING.swap(false, Ordering::AcqRel) {
            TRAY_SYNC_RUNNING.store(false, Ordering::Release);

            if TRAY_SYNC_PENDING.swap(false, Ordering::AcqRel)
                && TRAY_SYNC_RUNNING
                    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                    .is_ok()
            {
                continue;
            }

            break;
        }
    }
}

/// 进程代理·真零延迟快速通道：只重建 rules，直接通过嵌入内核内部通道 PATCH mihomo
/// /configs 只更新 rules（部分更新，不重载 providers/DNS/代理组），不跑完整重载。
#[tauri::command]
pub async fn apply_process_rules_fast() -> CmdResult<()> {
    let process_rules: Vec<String> = Config::verge()
        .await
        .latest_arc()
        .process_rules
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|s| s.to_string())
        .collect();
    let current_rules = Config::runtime().await.latest_arc().rules();
    let non_process: Vec<String> = current_rules
        .into_iter()
        .filter(|r| !r.starts_with("PROCESS-NAME,") && !r.starts_with("PROCESS-PATH,"))
        .collect();
    let mut new_rules = process_rules;
    new_rules.extend(non_process);

    // 真零延迟：嵌入内核内部通道 PATCH mihomo，只更新 rules，不跑 update_config_forced 完整重载。
    let json_value = serde_json::json!({ "rules": new_rules });
    crate::handle::Handle::mihomo()
        .await
        .patch_base_config(&json_value)
        .await
        .map_err(|e| e.to_string())?;

    // 同步本地 clash 配置（持久化，重启后还在），照 change_clash_mode 的标准做法。
    let rules_value: Vec<serde_yaml_ng::Value> = new_rules
        .iter()
        .map(|s| serde_yaml_ng::Value::from(s.as_str()))
        .collect();
    let mut mapping = serde_yaml_ng::Mapping::new();
    mapping.insert("rules".into(), serde_yaml_ng::Value::Sequence(rules_value));
    let clash = Config::clash().await;
    clash.edit_draft(|d| d.patch_config(&mapping));
    clash.apply();

    Ok(())
}
