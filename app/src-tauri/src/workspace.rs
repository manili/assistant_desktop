use std::fs;
use std::path::{Path, PathBuf};
use std::collections::BTreeMap;

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

/// Lightweight, compile-free .gitignore matching engine.
struct GitignoreMatcher {
    patterns: Vec<String>,
}

impl GitignoreMatcher {
    fn new(root: &Path) -> Self {
        let mut patterns = Vec::new();
        let gitignore_path = root.join(".gitignore");
        if gitignore_path.exists() {
            if let Ok(content) = fs::read_to_string(&gitignore_path) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.is_empty() || trimmed.starts_with('#') {
                        continue;
                    }
                    patterns.push(trimmed.to_string());
                }
            }
        }
        Self { patterns }
    }

    fn is_ignored(&self, relative_path: &str, is_dir: bool) -> bool {
        // Absolute Safeguard: Always block internal Git directories from being exposed
        if relative_path == ".git" || relative_path.starts_with(".git/") {
            return true;
        }

        // Fallback to manual skip list if no .gitignore is present
        if self.patterns.is_empty() {
            let name = relative_path.split('/').last().unwrap_or(relative_path);
            return name == "node_modules" 
                || name == "target" 
                || name == "dist" 
                || name == "build" 
                || name == ".next" 
                || name == ".cache" 
                || name == ".yarn"
                || name == ".DS_Store";
        }

        // Evaluate loaded rules
        for pattern in &self.patterns {
            let mut pat = pattern.as_str();
            let is_dir_only_pattern = pat.ends_with('/');
            
            if is_dir_only_pattern {
                pat = pat.trim_end_matches('/');
                if !is_dir {
                    continue; // Skip directory-only pattern if this item is a file
                }
            }

            // Anchored pattern (e.g., /config.json or /dist)
            if pat.starts_with('/') {
                let anchored = pat.trim_start_matches('/');
                if relative_path == anchored || (is_dir && relative_path.starts_with(&format!("{}/", anchored))) {
                    return true;
                }
                continue;
            }

            // Suffix wildcards (e.g., *.log, *.env)
            if pat.starts_with('*') {
                let suffix = &pat[1..];
                if relative_path.ends_with(suffix) {
                    return true;
                }
                continue;
            }

            // Relative substring checks (matches files/folders anywhere in directory path)
            let pat_dir = format!("{}/", pat);
            let pat_mid = format!("/{}/", pat);
            let pat_end = format!("/{}", pat);

            if relative_path == pat 
                || relative_path.starts_with(&pat_dir)
                || relative_path.ends_with(&pat_end)
                || relative_path.contains(&pat_mid)
            {
                return true;
            }
        }

        false
    }
}

/// Recursively traverses directory tree, evaluating relative items against .gitignore matcher.
fn walk_dir_recursive(
    root: &Path, 
    current: &Path, 
    matcher: &GitignoreMatcher, 
    files: &mut Vec<String>
) -> Result<(), String> {
    let is_dir = current.is_dir();
    
    // Evaluate relative paths against active rules
    if let Ok(rel) = current.strip_prefix(root) {
        if let Some(rel_str) = rel.to_str() {
            if !rel_str.is_empty() {
                if matcher.is_ignored(rel_str, is_dir) {
                    return Ok(()); // Stop walking down this ignored directory branch
                }
            }
        }
    }

    if is_dir {
        for entry in fs::read_dir(current).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            walk_dir_recursive(root, &path, matcher, files)?;
        }
    } else {
        if let Ok(rel) = current.strip_prefix(root) {
            if let Some(rel_str) = rel.to_str() {
                if !rel_str.is_empty() {
                    files.push(rel_str.to_string());
                }
            }
        }
    }
    Ok(())
}

#[derive(Debug)]
struct RustTreeNode {
    name: String,
    is_file: bool,
    children: BTreeMap<String, RustTreeNode>,
}

fn build_rust_tree(paths: &[String]) -> RustTreeNode {
    let mut root = RustTreeNode {
        name: "./".to_string(),
        is_file: false,
        children: BTreeMap::new(),
    };

    for path in paths {
        let parts: Vec<&str> = path.split('/').collect();
        let mut current = &mut root;
        
        for (i, part) in parts.iter().enumerate() {
            let is_last = i == parts.len() - 1;
            // Workaround for BTreeMap's entry borrow limitations in loops
            if !current.children.contains_key(*part) {
                current.children.insert(part.to_string(), RustTreeNode {
                    name: part.to_string(),
                    is_file: is_last,
                    children: BTreeMap::new(),
                });
            }
            current = current.children.get_mut(*part).unwrap();
        }
    }
    root
}

fn print_rust_tree(node: &RustTreeNode, prefix: &str) -> String {
    let mut result = String::new();
    
    // Separate directories and files
    let mut dirs = Vec::new();
    let mut files = Vec::new();
    
    for (name, child) in &node.children {
        if child.is_file {
            files.push(name);
        } else {
            dirs.push(name);
        }
    }
    
    // Sort directories first alphabetically, then files alphabetically
    dirs.sort();
    files.sort();
    
    let mut sorted_keys = dirs;
    sorted_keys.extend(files);
    
    for (i, key) in sorted_keys.iter().enumerate() {
        let child = node.children.get(*key).unwrap();
        let is_last = i == sorted_keys.len() - 1;
        let connector = if is_last { "└── " } else { "├── " };
        
        result.push_str(&format!("{}{}{}\n", prefix, connector, child.name));
        
        if !child.is_file {
            let next_prefix = format!("{}{}", prefix, if is_last { "    " } else { "│   " });
            result.push_str(&print_rust_tree(child, &next_prefix));
        }
    }
    result
}

#[tauri::command]
pub fn list_files_in_workspace(root_path: String) -> Result<Vec<String>, String> {
    let root = Path::new(&root_path);
    if !root.exists() || !root.is_dir() { return Err("Workspace root is invalid".to_string()); }

    let mut files = Vec::new();
    let matcher = GitignoreMatcher::new(root);
    walk_dir_recursive(root, root, &matcher, &mut files)?;
    
    // Sort alphabetically
    files.sort();
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

#[tauri::command]
pub fn compile_selected_files_prompt(
    root_path: String,
    selected_files: Vec<String>,
) -> Result<String, String> {
    if selected_files.is_empty() {
        return Ok("".to_string());
    }

    let root = Path::new(&root_path);
    
    // 1. Generate ASCII tree structure
    let tree = build_rust_tree(&selected_files);
    let mut prompt_context = "Directory Structure:\n\n└── ./\n".to_string();
    prompt_context.push_str(&print_rust_tree(&tree, "    "));
    prompt_context.push_str("\n\n");

    // 2. Read each file and append content block
    for file_name in &selected_files {
        let safe_path = sanitize_path(root, file_name)?;
        let content = fs::read_to_string(&safe_path)
            .map_err(|e| format!("Failed to read file '{}': {}", file_name, e))?;

        prompt_context.push_str(&format!("---\nFile: /{}\n---\n\n{}\n\n\n\n", file_name, content));
    }

    Ok(prompt_context)
}