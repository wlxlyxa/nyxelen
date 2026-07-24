use anyhow::Result;
use smartstring::alias::String;

pub type CmdResult<T = ()> = Result<T, String>;

// Command modules
pub mod app;
pub mod backup;
pub mod clash;
pub mod dns_leak_protection;
pub mod ipv6_control;
pub mod kill_switch;
pub mod license;
pub mod lightweight;
pub mod media_unlock_checker;
pub mod network;
pub mod profile;
pub mod proxy;
pub mod runtime;
pub mod save_profile;
pub mod service;
pub mod system;
pub mod uwp;
pub mod validate;
pub mod verge;
pub mod webdav;
pub mod webrtc_control;
pub mod subscription;
pub mod sys_restore;
pub mod rescue;
pub mod privacy_suite;
pub mod physical_nic_lock;
pub mod leak_protection_ext;

// Re-export all command functions for backwards compatibility
pub use app::*;
pub use backup::*;
pub use clash::*;
pub use dns_leak_protection::*;
pub use ipv6_control::*;
pub use kill_switch::*;
pub use lightweight::*;
pub use media_unlock_checker::*;
pub use network::*;
pub use profile::*;
pub use proxy::*;
pub use runtime::*;
pub use save_profile::*;
pub use service::*;
pub use system::*;
pub use uwp::*;
pub use validate::*;
pub use verge::*;
pub use webdav::*;
pub use webrtc_control::*;
pub use subscription::*;
pub use sys_restore::*;
pub use rescue::*;
pub use privacy_suite::*;
pub use physical_nic_lock::*;
pub use leak_protection_ext::*;

pub trait StringifyErr<T> {
    fn stringify_err(self) -> CmdResult<T>;
    fn stringify_err_log<F>(self, log_fn: F) -> CmdResult<T>
    where
        F: Fn(&str);
}

impl<T, E: std::fmt::Display> StringifyErr<T> for Result<T, E> {
    fn stringify_err(self) -> CmdResult<T> {
        self.map_err(|e| e.to_string().into())
    }

    fn stringify_err_log<F>(self, log_fn: F) -> CmdResult<T>
    where
        F: Fn(&str),
    {
        self.map_err(|e| {
            let msg = String::from(e.to_string());
            log_fn(&msg);
            msg
        })
    }
}
