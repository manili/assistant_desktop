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
         );
         CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL UNIQUE,
            active_tab TEXT
         );
         CREATE TABLE IF NOT EXISTS workspace_tabs (
            workspace_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            PRIMARY KEY (workspace_id, file_name),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
         );
         CREATE TABLE IF NOT EXISTS workspace_selected_files (
            workspace_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            PRIMARY KEY (workspace_id, file_name),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
         );
         CREATE TABLE IF NOT EXISTS workspace_messages (
            id TEXT PRIMARY KEY NOT NULL,
            workspace_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            is_selected INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
         );"
    ).map_err(|e| e.to_string())?;
    
    // 1. Seed providers if missing
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

    // 2. Seed default system prompt if missing
    let prompt_exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM settings WHERE key = 'system_instruction'",
        [],
        |row| row.get(0)
    ).unwrap_or(0);

if prompt_exists == 0 {
        let default_prompt = "You are an advanced desktop AI coding agent with shell execution and code writing/patching capabilities.\n\n\
1. If you want to suggest executing a terminal command, wrap your command inside <execute_command>YOUR_SHELL_COMMAND</execute_command> tags.\n\n\
2. If you want to modify, edit, or write a code file inside the user's workspace, you have two options:\n\n\
   A. [For minor edits / patching (Highly Optimized)]: If you are editing an existing file, propose a search-and-replace patch using the <patch_file file_name=\"TARGET_FILENAME\"> tag containing one or more original/updated blocks:\n\
      <patch_file file_name=\"src/main.rs\">\n\
      <<<<<<< SEARCH\n\
      fn main() {\n\
          println!(\"Hello, World!\");\n\
      }\n\
      =======\n\
      fn main() {\n\
          println!(\"Hello, Agentic World!\");\n\
      }\n\
      >>>>>>> REPLACE\n\
      </patch_file>\n\
      Make sure your SEARCH block matches the original file content exactly, including whitespace.\n\n\
   B. [For creating new files / full rewrites]: Propose a full file write using the <write_file file_name=\"TARGET_FILENAME\">YOUR_NEW_CODE</write_file> tag. Always supply the full file content inside the tag.\n\n\
Your proposals will be securely intercepted, presented to the user, and will only execute upon explicit click authorization.";

        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('system_instruction', ?1)",
            [default_prompt]
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