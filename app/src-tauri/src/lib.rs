mod db;
mod secrets;
mod providers;
mod commands;
mod workspace;
mod chat;
mod terminal;

use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data = app.path().app_data_dir()?;
            let db_path = app_data.join("db.sqlite");
            
            println!("Initializing Local SQLite Database at: {:?}", db_path);
            let conn = db::init_db(db_path).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            
            // Sync environment variables on startup
            let bypass_rules = db::get_bypass_rules(&conn);
            let comma_separated = bypass_rules.join(",");
            std::env::set_var("NO_PROXY", &comma_separated);
            std::env::set_var("no_proxy", &comma_separated);
            
            app.manage(AppState { db: Mutex::new(conn) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_api_key,
            commands::delete_api_key,
            commands::get_providers_status,
            commands::test_provider_connection,
            commands::save_setting,
            commands::get_setting,
            commands::fetch_provider_models,
            workspace::list_files_in_workspace,
            workspace::read_workspace_file,
            workspace::write_workspace_file,
            workspace::patch_workspace_file,
            workspace::compile_selected_files_prompt,
            chat::stream_chat,
            terminal::execute_terminal_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}