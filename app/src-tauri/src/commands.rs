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
    let (provider_type, api_url, bypass_rules) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let rules = crate::db::get_bypass_rules(&db);
        let (pt, url) = db.query_row(
            "SELECT provider_type, api_url FROM providers WHERE id = ?1", 
            [&provider_id], 
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        ).map_err(|e| e.to_string())?;
        (pt, url, rules)
    };
    
    let api_key = get_api_key_helper(&provider_id, &state);
    if provider_id != "ollama" && provider_id != "lmstudio" && api_key.is_empty() {
        return Err("API Key is required".to_string());
    }
    
    if provider_type == "anthropic" { 
        test_anthropic_connection(&api_url, &api_key, &bypass_rules).await 
    } else if provider_type == "gemini" { 
        test_gemini_connection(&api_url, &api_key, &bypass_rules).await 
    } else { 
        test_openai_connection(&api_url, &api_key, &bypass_rules).await 
    }
}

#[tauri::command]
pub fn save_setting(key: String, value: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)", [&key, &value]).map_err(|e| e.to_string())?;
    
    // Dynamically synchronize system environment variables if proxy bypass rules change!
    if key == "proxy_bypass_rules" {
        let bypass_rules = crate::db::get_bypass_rules(&db);
        let comma_separated = bypass_rules.join(",");
        std::env::set_var("NO_PROXY", &comma_separated);
        std::env::set_var("no_proxy", &comma_separated);
    }
    Ok(())
}

#[tauri::command]
pub fn get_setting(key: String, state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let val: Result<String, _> = db.query_row("SELECT value FROM settings WHERE key = ?1", [&key], |row| row.get(0));
    match val { Ok(v) => Ok(v), Err(_) => Ok("".to_string()) }
}

#[tauri::command]
pub async fn fetch_provider_models(provider_id: String, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let (provider_type, api_url, bypass_rules) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let rules = crate::db::get_bypass_rules(&db);
        let (pt, url) = db.query_row(
            "SELECT provider_type, api_url FROM providers WHERE id = ?1", 
            [&provider_id], 
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        ).map_err(|e| e.to_string())?;
        (pt, url, rules)
    };

    let api_key = get_api_key_helper(&provider_id, &state);
    if provider_type != "openai" && provider_id != "ollama" && provider_id != "lmstudio" && api_key.is_empty() {
        return Err("An API Key is required to list available models.".to_string());
    }

    // Set up client with bypass rules
    let mut builder = reqwest::Client::builder();
    let url_lower = api_url.to_lowercase();
    let should_bypass = bypass_rules.iter().any(|rule| url_lower.contains(&rule.to_lowercase()));
    if should_bypass {
        builder = builder.no_proxy();
    }
    let client = builder.build().unwrap_or_default();

    let mut models = Vec::new();

    match provider_type.as_str() {
        "anthropic" => {
            let url = format!("{}/models", api_url.trim_end_matches('/'));
            let res = client.get(&url)
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if !res.status().is_success() {
                let text = res.text().await.unwrap_or_default();
                return Err(format!("Anthropic error: {}", text));
            }

            let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            if let Some(arr) = json["data"].as_array() {
                for m in arr {
                    if let Some(id) = m["id"].as_str() {
                        models.push(id.to_string());
                    }
                }
            }
        },
        "gemini" => {
            let url = format!("{}/models", api_url.trim_end_matches('/'));
            let res = client.get(&url)
                .header("x-goog-api-key", &api_key)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if !res.status().is_success() {
                let text = res.text().await.unwrap_or_default();
                return Err(format!("Gemini error: {}", text));
            }

            let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            if let Some(arr) = json["models"].as_array() {
                for m in arr {
                    if let Some(name) = m["name"].as_str() {
                        // Strip the "models/" prefix Google returns by default
                        let clean_name = name.strip_prefix("models/").unwrap_or(name);
                        models.push(clean_name.to_string());
                    }
                }
            }
        },
        _ => { // openai, ollama, lmstudio
            let url = format!("{}/models", api_url.trim_end_matches('/'));
            let mut req = client.get(&url);
            if !api_key.is_empty() {
                req = req.header("Authorization", format!("Bearer {}", api_key));
            }
            let res = req.send().await.map_err(|e| e.to_string())?;

            if !res.status().is_success() {
                let text = res.text().await.unwrap_or_default();
                return Err(format!("Provider error: {}", text));
            }

            let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            if let Some(arr) = json["data"].as_array() {
                for m in arr {
                    if let Some(id) = m["id"].as_str() {
                        models.push(id.to_string());
                    }
                }
            }
        }
    }

    models.sort();
    Ok(models)
}