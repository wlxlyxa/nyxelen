use super::CmdResult;

#[derive(Debug, Clone)]
pub struct LicenseStatus {
    pub activated: bool,
}

#[tauri::command]
pub async fn get_machine_code() -> CmdResult<String> {
    Ok("placeholder".into())
}

pub fn check_license_silent() -> Result<LicenseStatus, String> {
    Ok(LicenseStatus { activated: true })
}
