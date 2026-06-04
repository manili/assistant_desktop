use keyring::Entry;

const SERVICE_NAME: &str = "com.butterflex.assistant-desktop";

pub fn store_api_key(provider_id: &str, api_key: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, provider_id).map_err(|e| e.to_string())?;
    let _ = entry.delete_credential(); 
    entry.set_password(api_key).map_err(|e| format!("Keychain Error: {}", e))?;
    Ok(())
}

pub fn get_api_key(provider_id: &str) -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, provider_id).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

pub fn delete_api_key(provider_id: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, provider_id).map_err(|e| e.to_string())?;
    let _ = entry.delete_credential(); 
    Ok(())
}