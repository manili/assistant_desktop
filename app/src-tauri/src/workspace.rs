use std::fs;
use std::path::{Path, PathBuf};

pub fn sanitize_path(base: &Path, requested: &str) -> Result<PathBuf, String> {
    let full_path = base.join(requested);
    let canonical_full = full_path.canonicalize().map_err(|_| "File not found or invalid path")?;
    let canonical_base = base.canonicalize().map_err(|_| "Invalid workspace root")?;
    
    if canonical_full.starts_with(canonical_base) {
        Ok(canonical_full)
    } else {
        Err("Security Error: Attempted path traversal outside workspace boundary".to_string())
    }
}

#[tauri::command]
pub fn list_files_in_workspace(root_path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let root = Path::new(&root_path);
    
    if !root.exists() || !root.is_dir() { return Err("Workspace root is invalid".to_string()); }

    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    if let Some(name) = entry.file_name().to_str() {
                        files.push(name.to_string());
                    }
                }
            }
        }
    }
    Ok(files)
}

#[tauri::command]
pub fn read_workspace_file(root_path: String, file_name: String) -> Result<String, String> {
    let root = Path::new(&root_path);
    let safe_path = sanitize_path(root, &file_name)?;
    fs::read_to_string(safe_path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_workspace_file(root_path: String, file_name: String, content: String) -> Result<String, String> {
    let root = Path::new(&root_path);
    
    // Combine and safely canonicalize parent directory boundary
    let combined = root.join(&file_name);
    let parent = combined.parent().ok_or("Invalid file path parent")?;
    let canonical_parent = parent.canonicalize().map_err(|_| "Invalid target folder path")?;
    let canonical_base = root.canonicalize().map_err(|_| "Invalid workspace root")?;

    if !canonical_parent.starts_with(canonical_base) {
        return Err("Security Error: Attempted to write outside workspace directory boundary".to_string());
    }

    // Write file
    fs::write(&combined, content).map_err(|e| format!("Write failed: {}", e))?;
    Ok(format!("Successfully wrote modifications to {}", file_name))
}