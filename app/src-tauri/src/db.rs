use rusqlite::Connection;
use std::path::PathBuf;

pub fn init_db(db_path: PathBuf) -> Result<Connection, String> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS providers (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            provider_type TEXT NOT NULL,
            api_url TEXT NOT NULL,
            is_enabled INTEGER DEFAULT 1
         );"
    ).map_err(|e| e.to_string())?;
    
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM providers", [], |row| row.get(0)).unwrap_or(0);
    
    if count == 0 {
        conn.execute_batch(
            "INSERT INTO providers (id, name, provider_type, api_url) VALUES 
             ('anthropic', 'Anthropic Claude', 'anthropic', 'https://api.anthropic.com/v1'),
             ('openai', 'OpenAI', 'openai', 'https://api.openai.com/v1'),
             ('gemini', 'Google Gemini', 'gemini', 'https://generativelanguage.googleapis.com/v1beta'),
             ('ollama', 'Ollama (Local)', 'openai', 'http://localhost:11434/v1'),
             ('lmstudio', 'LM Studio (Local)', 'openai', 'http://192.168.100.44:1234/v1');"
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(conn)
}

/// Reads the user-specified proxy bypass rules from SQL, returning a list of matchable patterns.
pub fn get_bypass_rules(conn: &Connection) -> Vec<String> {
    let mut rules = vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
        "::1".to_string(),
    ];
    
    if let Ok(val) = conn.query_row(
        "SELECT value FROM settings WHERE key = 'proxy_bypass_rules'",
        [],
        |row| row.get::<_, String>(0)
    ) {
        for rule in val.split_whitespace() {
            let trimmed = rule.trim();
            if !trimmed.is_empty() {
                rules.push(trimmed.to_string());
            }
        }
    }
    rules
}