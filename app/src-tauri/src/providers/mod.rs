use serde::{Serialize, Deserialize};
use reqwest::Client;
use std::time::Duration;

#[derive(Serialize, Deserialize)]
pub struct ProviderStatus {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub api_url: String,
    pub has_key: bool,
    pub is_local_online: bool,
}

fn get_client_for_url(url: &str) -> Client {
    let mut builder = Client::builder();
    if url.contains("localhost") || url.contains("127.0.0.1") || url.contains("192.168") || url.contains("::1") {
        builder = builder.no_proxy(); 
    }
    builder.build().unwrap_or_else(|_| Client::new())
}

pub async fn ping_url(url: &str) -> bool {
    let client = Client::builder().timeout(Duration::from_secs(1)).no_proxy().build().unwrap_or_default();
    if let Ok(res) = client.get(url).send().await {
        res.status().is_success() || res.status().as_u16() == 404 || res.status().as_u16() == 401
    } else {
        false
    }
}

pub async fn test_anthropic_connection(api_url: &str, api_key: &str) -> Result<String, String> {
    let client = get_client_for_url(api_url);
    let body = serde_json::json!({
        "model": "claude-3-haiku-20240307",
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "Ping"}]
    });

    let res = client.post(format!("{}/messages", api_url))
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status();
    if status.is_success() {
        Ok("Successfully authenticated with Anthropic!".to_string())
    } else {
        let err_text = res.text().await.unwrap_or_default();
        Err(format!("Error Response [Status {}]: {}", status, err_text))
    }
}

pub async fn test_openai_connection(api_url: &str, api_key: &str) -> Result<String, String> {
    let client = get_client_for_url(api_url);
    let mut req = client.get(format!("{}/models", api_url));
    if !api_key.is_empty() { req = req.header("Authorization", format!("Bearer {}", api_key)); }
    let res = req.send().await.map_err(|e| e.to_string())?;
    
    let status = res.status();
    if status.is_success() {
        Ok("Successfully connected to OpenAI models endpoint!".to_string())
    } else {
        let err_text = res.text().await.unwrap_or_default();
        Err(format!("Error Response [Status {}]: {}", status, err_text))
    }
}

pub async fn test_gemini_connection(api_url: &str, api_key: &str) -> Result<String, String> {
    let client = get_client_for_url(api_url);
    let res = client.get(format!("{}/models", api_url))
        .header("x-goog-api-key", api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status();
    if status.is_success() {
        Ok("Successfully authenticated with Google Gemini API!".to_string())
    } else {
        let err_text = res.text().await.unwrap_or_default();
        Err(format!("Error Response [Status {}]: {}", status, err_text))
    }
}