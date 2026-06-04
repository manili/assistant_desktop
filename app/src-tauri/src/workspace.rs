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

#[derive(Debug)]
struct PatchBlock {
    search: String,
    replace: String,
}

/// Parses Aider-style <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks.
fn parse_patches(content: &str) -> Vec<PatchBlock> {
    let mut patches = Vec::new();
    let mut lines = content.lines().peekable();
    
    while lines.peek().is_some() {
        // Skip lines until we find the start tag
        let mut found_search = false;
        while let Some(line) = lines.next() {
            if line.trim_start().starts_with("<<<<<<< SEARCH") {
                found_search = true;
                break;
            }
        }
        if !found_search { break; }
        
        let mut search_lines = Vec::new();
        let mut found_divider = false;
        while let Some(line) = lines.next() {
            if line.trim_start().starts_with("=======") {
                found_divider = true;
                break;
            }
            search_lines.push(line.to_string());
        }
        if !found_divider { break; }
        
        let mut replace_lines = Vec::new();
        let mut found_replace = false;
        while let Some(line) = lines.next() {
            if line.trim_start().starts_with(">>>>>>> REPLACE") {
                found_replace = true;
                break;
            }
            replace_lines.push(line.to_string());
        }
        if !found_replace { break; }
        
        patches.push(PatchBlock {
            search: search_lines.join("\n"),
            replace: replace_lines.join("\n"),
        });
    }
    patches
}

/// Applies parsed search-and-replace blocks sequentially, with newline normalization.
fn apply_patches(file_content: &str, patches: &[PatchBlock]) -> Result<String, String> {
    let mut content = file_content.to_string();
    
    for (i, patch) in patches.iter().enumerate() {
        // 1. Try exact match
        if content.contains(&patch.search) {
            content = content.replace(&patch.search, &patch.replace);
        } else {
            // 2. Normalize Windows/Unix newlines and try again
            let norm_content = content.replace("\r\n", "\n");
            let norm_search = patch.search.replace("\r\n", "\n");
            let norm_replace = patch.replace.replace("\r\n", "\n");
            
            if norm_content.contains(&norm_search) {
                content = norm_content.replace(&norm_search, &norm_replace);
            } else {
                return Err(format!(
                    "Patch block #{} failed to apply. Could not find match for SEARCH block:\n```\n{}\n```",
                    i + 1,
                    patch.search
                ));
            }
        }
    }
    Ok(content)
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

#[tauri::command]
pub fn patch_workspace_file(root_path: String, file_name: String, patch_content: String) -> Result<String, String> {
    let root = Path::new(&root_path);
    let safe_path = sanitize_path(root, &file_name)?;
    
    let file_content = fs::read_to_string(&safe_path).map_err(|e| format!("Failed to read file: {}", e))?;
    let patches = parse_patches(&patch_content);
    
    if patches.is_empty() {
        return Err("No valid patch blocks (<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE) found.".to_string());
    }
    
    let new_content = apply_patches(&file_content, &patches)?;
    fs::write(&safe_path, &new_content).map_err(|e| format!("Failed to write patched file: {}", e))?;
    
    Ok(format!("Successfully applied {} patch block(s) to {}", patches.len(), file_name))
}