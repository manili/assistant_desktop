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
    
    let (provider_type, mut api_url) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT provider_type, api_url FROM providers WHERE id = ?1", 
            [&provider_id], 
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        ).map_err(|e| e.to_string())?
    };

    let api_key = get_api_key(&provider_id).unwrap_or_default();
    
    if provider_type != "openai" && provider_id != "ollama" && provider_id != "lmstudio" {
        return Err("Streaming is only implemented for OpenAI-compatible endpoints in Milestone 3.".to_string());
    }

    let model_name = if provider_id == "ollama" { "llama3" } else { "gpt-3.5-turbo" };
    if !api_url.ends_with("/chat/completions") { api_url = format!("{}/chat/completions", api_url.trim_end_matches('/')); }

    let system_instructions = "You are an advanced desktop AI coding agent with shell execution and code writing capabilities.\n\n\
    1. If you want to suggest executing a terminal command, wrap your command inside `<execute_command>YOUR_SHELL_COMMAND</execute_command>` tags.\n\n\
    2. If you want to modify, edit, or write a code file inside the user's workspace, wrap your full code inside `<write_file file_name=\"TARGET_FILENAME\">YOUR_NEW_CODE</write_file>` tags. Always supply the full file content inside the tag.\n\n\
    Your proposals will be securely intercepted, presented to the user, and will only execute upon explicit click authorization.";

    let body = serde_json::json!({
        "model": model_name,
        "stream": true,
        "messages": [
            {"role": "system", "content": system_instructions},
            {"role": "user", "content": prompt}
        ]
    });

    let mut builder = Client::builder();
    if api_url.contains("localhost") || api_url.contains("127.0.0.1") || api_url.contains("192.168") {
        builder = builder.no_proxy();
    }
    
    let client = builder.build().unwrap_or_default();
    let mut req = client.post(&api_url).json(&body);
    if !api_key.is_empty() { req = req.header("Authorization", format!("Bearer {}", api_key)); }

    let res = req.send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() { return Err(format!("API Error: {}", res.status())); }

    let mut stream = res.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        if let Ok(bytes) = chunk_result {
            let chunk_str = String::from_utf8_lossy(&bytes);
            for line in chunk_str.lines() {
                if line.starts_with("data: ") {
                    let data = line.trim_start_matches("data: ").trim();
                    if data == "[DONE]" { continue; }
                    
                    if let Ok(json) = serde_json::from_str::<Value>(data) {
                        if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                            let _ = app.emit("chat-token", ChatTokenPayload { token: content.to_string() });
                        }
                    }
                }
            }
        }
    }
    Ok(())
}