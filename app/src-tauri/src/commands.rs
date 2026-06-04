use crate::AppState;
use crate::secrets;
use crate::providers::{ProviderStatus, ping_url, test_anthropic_connection, test_openai_connection, test_gemini_connection};
use tauri::State;

fn get_api_key_helper(provider_id: &str, state: &State<'_, AppState>) -> String {
    if let Ok(key) = secrets::get_api_key(provider_id) {
        if !key.trim().is_empty() { return key; }
    }
    if let Ok(db) = state.db.lock() {
        let val: Result<String, _> = db.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [format!("api_key:{}", provider_id)],
            |row| row.get(0)
        );
        if let Ok(key) = val { return key; }
    }
    "".to_string()
}

#[tauri::command]
pub async fn save_api_key(provider_id: String, api_key: String, state: State<'_, AppState>) -> Result<(), String> {
    if api_key.trim().is_empty() { return Err("API Key cannot be blank".to_string()); }
    match secrets::store_api_key(&provider_id, &api_key) {
        Ok(_) => Ok(()),
        Err(_) => {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)", [format!("api_key:{}", provider_id), api_key]).map_err(|e| e.to_string())?;
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn delete_api_key(provider_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let _ = secrets::delete_api_key(&provider_id);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let _ = db.execute("DELETE FROM settings WHERE key = ?1", [format!("api_key:{}", provider_id)]);
    Ok(())
}

#[tauri::command]
pub async fn get_providers_status(state: State<'_, AppState>) -> Result<Vec<ProviderStatus>, String> {
    let provider_rows = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("SELECT id, name, provider_type, api_url FROM providers WHERE is_enabled = 1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?))).map_err(|e| e.to_string())?;
        
        let mut gathered = Vec::new();
        for r in rows { if let Ok(item) = r { gathered.push(item); } }
        gathered
    };

    let mut list = Vec::new();
    for (id, name, provider_type, api_url) in provider_rows {
        let api_key = get_api_key_helper(&id, &state);
        let has_key = !api_key.trim().is_empty();
        
        let is_local_online = if id == "ollama" || id == "lmstudio" { ping_url(&api_url).await } else { false };
        list.push(ProviderStatus { id, name, provider_type, api_url, has_key, is_local_online });
    }
    Ok(list)
}

#[tauri::command]
pub async fn test_provider_connection(provider_id: String, state: State<'_, AppState>) -> Result<String, String> {
    let (provider_type, api_url) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row("SELECT provider_type, api_url FROM providers WHERE id = ?1", [&provider_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))).map_err(|e| e.to_string())?
    };
    
    let api_key = get_api_key_helper(&provider_id, &state);
    if provider_id != "ollama" && provider_id != "lmstudio" && api_key.is_empty() {
        return Err("API Key is required".to_string());
    }
    
    if provider_type == "anthropic" { test_anthropic_connection(&api_url, &api_key).await }
    else if provider_type == "gemini" { test_gemini_connection(&api_url, &api_key).await }
    else { test_openai_connection(&api_url, &api_key).await }
}

#[tauri::command]
pub fn save_setting(key: String, value: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)", [&key, &value]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_setting(key: String, state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let val: Result<String, _> = db.query_row("SELECT value FROM settings WHERE key = ?1", [&key], |row| row.get(0));
    match val { Ok(v) => Ok(v), Err(_) => Ok("".to_string()) }
}