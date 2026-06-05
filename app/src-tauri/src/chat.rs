use tauri::{AppHandle, State, Emitter};
use reqwest::Client;
use futures_util::StreamExt;
use serde_json::Value;
use crate::AppState;
use crate::secrets::get_api_key;

#[derive(Clone, serde::Serialize)]
pub struct ChatTokenPayload {
    pub token: String,
}

#[tauri::command]
pub async fn stream_chat(
    app: AppHandle,
    state: State<'_, AppState>,
    provider_id: String,
    prompt: String,
) -> Result<(), String> {
    
    let (provider_type, api_url, bypass_rules, mut system_instructions) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let bypass = crate::db::get_bypass_rules(&db);
        
        let (pt, url) = db.query_row(
            "SELECT provider_type, api_url FROM providers WHERE id = ?1", 
            [&provider_id], 
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        ).map_err(|e| e.to_string())?;

        let sys_prompt: String = db.query_row(
            "SELECT value FROM settings WHERE key = 'system_instruction'",
            [],
            |row| row.get(0)
        ).unwrap_or_else(|_| "".to_string());

        (pt, url, bypass, sys_prompt)
    };

    let api_key = get_api_key(&provider_id).unwrap_or_default();
    
    if provider_type != "openai" && provider_id != "ollama" && provider_id != "lmstudio" && api_key.is_empty() {
        return Err(format!("An API Key is required to use {}.", provider_id));
    }

    let mut final_user_prompt = prompt.clone();

    if prompt.contains("--- USER PROMPT ---") {
        let parts: Vec<&str> = prompt.split("--- USER PROMPT ---").collect();
        if parts.len() == 2 {
            let system_part = parts[0]
                .trim_start_matches("--- SYSTEM INSTRUCTIONS ---")
                .trim();
            let user_part = parts[1].trim();
            
            if !system_part.is_empty() { system_instructions = system_part.to_string(); }
            final_user_prompt = user_part.to_string();
        }
    }

    if system_instructions.trim().is_empty() {
        system_instructions = "You are an expert software developer.".to_string();
    }

    let active_model = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let setting_key = format!("active_model:{}", provider_id);
        let val: Result<String, _> = db.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [&setting_key],
            |row| row.get(0)
        );
        match val {
            Ok(model) if !model.trim().is_empty() => model,
            _ => {
                if provider_type == "anthropic" { "claude-3-5-sonnet-20241022".to_string() }
                else if provider_type == "gemini" { "gemini-1.5-pro".to_string() }
                else if provider_id == "ollama" { "llama3".to_string() }
                else { "gpt-4o".to_string() }
            }
        }
    };

    let mut builder = Client::builder();
    let api_url_lower = api_url.to_lowercase();
    let should_bypass = bypass_rules.iter().any(|rule| api_url_lower.contains(&rule.to_lowercase()));
    if should_bypass { builder = builder.no_proxy(); }
    let client = builder.build().unwrap_or_default();

    let req = match provider_type.as_str() {
        "anthropic" => {
            let body = serde_json::json!({
                "model": active_model,
                "max_tokens": 4096,
                "stream": true,
                "system": system_instructions,
                "messages": [{"role": "user", "content": final_user_prompt}]
            });
            client.post(format!("{}/messages", api_url.trim_end_matches('/')))
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .json(&body)
        },
        "gemini" => {
            let body = serde_json::json!({
                "systemInstruction": { "parts": [{"text": system_instructions}] },
                "contents": [{"role": "user", "parts": [{"text": final_user_prompt}]}]
            });
            let url = format!("{}/models/{}:streamGenerateContent?alt=sse", api_url.trim_end_matches('/'), active_model);
            client.post(url).header("x-goog-api-key", api_key).json(&body)
        },
        _ => { // openai, ollama, lmstudio
            let url = if !api_url.ends_with("/chat/completions") {
                format!("{}/chat/completions", api_url.trim_end_matches('/'))
            } else {
                api_url.clone()
            };
            
            let body = serde_json::json!({
                "model": active_model,
                "stream": true,
                "messages": [
                    {"role": "system", "content": system_instructions},
                    {"role": "user", "content": final_user_prompt}
                ]
            });
            
            let mut r = client.post(url).json(&body);
            if !api_key.is_empty() { r = r.header("Authorization", format!("Bearer {}", api_key)); }
            r
        }
    };

    let res = req.send().await.map_err(|e| format!("Network request failed: {}", e))?;
    if !res.status().is_success() { 
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("API Error [{}]: {}", status, err_text)); 
    }

    let mut stream = res.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        if let Ok(bytes) = chunk_result {
            let chunk_str = String::from_utf8_lossy(&bytes);
            
            for line in chunk_str.lines() {
                if line.starts_with("data: ") {
                    let data = line.trim_start_matches("data: ").trim();
                    if data == "[DONE]" { continue; }
                    
                    if let Ok(json) = serde_json::from_str::<Value>(data) {
                        let mut token_str = String::new();

                        if provider_type == "anthropic" {
                            if let Some(text) = json["delta"]["text"].as_str() { token_str = text.to_string(); }
                        } else if provider_type == "gemini" {
                            if let Some(text) = json["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                                token_str = text.to_string();
                            }
                        } else {
                            if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                                token_str = content.to_string();
                            }
                        }

                        if !token_str.is_empty() {
                            let _ = app.emit("chat-token", ChatTokenPayload { token: token_str });
                        }
                    }
                }
            }
        }
    }
    Ok(())
}