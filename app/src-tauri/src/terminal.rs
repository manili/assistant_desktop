use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use std::sync::{Arc, Mutex};

#[derive(serde::Serialize)]
pub struct CommandResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub message: String,
}

#[tauri::command]
pub async fn execute_terminal_command(
    app: AppHandle,
    workspace_path: String,
    command_line: String,
) -> Result<CommandResult, String> {
    
    // Core security check: Prevent recursive deletions targeting parent or root folders
    let sanitized_command = command_line.trim().to_lowercase();
    if sanitized_command.contains("rm ") && (sanitized_command.contains("-rf") || sanitized_command.contains("-r")) {
        if sanitized_command.contains("/") || sanitized_command.contains("~") || sanitized_command.contains("..") {
            return Err("Security Blocked: Recursive deletion patterns targeting root, home, or parent paths are prohibited.".to_string());
        }
    }

    // Spawn the process with piped standard IO
    let mut child = TokioCommand::new("/bin/sh")
        .arg("-c")
        .arg(&command_line)
        .current_dir(&workspace_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout channel")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr channel")?;

    // Thread-safe stream log collectors
    let stdout_accumulator = Arc::new(Mutex::new(Vec::new()));
    let stderr_accumulator = Arc::new(Mutex::new(Vec::new()));

    // Stream and accumulate stdout
    let app_stdout = app.clone();
    let stdout_acc_clone = stdout_accumulator.clone();
    let mut stdout_reader = BufReader::new(stdout).lines();
    let stdout_handle = tokio::spawn(async move {
        while let Ok(Some(line)) = stdout_reader.next_line().await {
            let _ = app_stdout.emit("terminal-stdout", line.clone());
            if let Ok(mut acc) = stdout_acc_clone.lock() {
                acc.push(line);
            }
        }
    });

    // Stream and accumulate stderr
    let app_stderr = app.clone();
    let stderr_acc_clone = stderr_accumulator.clone();
    let mut stderr_reader = BufReader::new(stderr).lines();
    let stderr_handle = tokio::spawn(async move {
        while let Ok(Some(line)) = stderr_reader.next_line().await {
            let _ = app_stderr.emit("terminal-stderr", line.clone());
            if let Ok(mut acc) = stderr_acc_clone.lock() {
                acc.push(line);
            }
        }
    });

    // Await process streaming tasks and execution status
    let _ = tokio::join!(stdout_handle, stderr_handle);
    let status = child.wait().await.map_err(|e| e.to_string())?;

    let stdout_string = {
        let acc = stdout_accumulator.lock().map_err(|_| "Failed to lock stdout")?;
        acc.join("\n")
    };

    let stderr_string = {
        let acc = stderr_accumulator.lock().map_err(|_| "Failed to lock stderr")?;
        acc.join("\n")
    };

    Ok(CommandResult {
        exit_code: status.code().unwrap_or(-1),
        stdout: stdout_string,
        stderr: stderr_string,
        message: format!("Process exited with status code: {}", status.code().unwrap_or(-1)),
    })
}