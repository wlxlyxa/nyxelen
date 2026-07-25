pub mod autostart;
pub mod backup;
pub mod firewall_allow;
pub mod privacy_ops;
pub mod handle;
pub mod hotkey;
pub mod logger;
pub mod manager;
mod notification;
pub mod service;
pub mod sysopt;
pub mod timer;
pub mod tray;
pub mod updater;
pub mod validate;
pub mod watchdog;
pub mod win_uwp;

pub use self::{manager::CoreManager, timer::Timer, updater::SilentUpdater};
