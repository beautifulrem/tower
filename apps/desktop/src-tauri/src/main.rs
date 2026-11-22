// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().nth(1).as_deref() == Some(tower_supervisor::fs_helper::CLI_FLAG) {
        if let Err(e) = tower_supervisor::fs_helper::run_stdio() {
            eprintln!("tower fs-helper error: {e}");
            std::process::exit(1);
        }
        return;
    }
    tower_desktop_lib::run();
}
