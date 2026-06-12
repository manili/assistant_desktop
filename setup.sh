#!/usr/bin/env bash
set -euo pipefail

# 1. Resolve root and subfolders
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="$PROJECT_DIR/tools"
NODE_DIR="$TOOLS_DIR/node_env"
CARGO_DIR="$TOOLS_DIR/cargo_env"
APP_DIR="$PROJECT_DIR/app"

# Create the skeleton
mkdir -p "$TOOLS_DIR" "$APP_DIR"

# 2. System Dependency Verification (Must have Xcode CLI tools)
if ! xcode-select -p &>/dev/null; then
  echo "Error: Xcode Command Line Tools must be installed globally."
  echo "Please run: xcode-select --install"
  exit 1
fi

echo "Setting up local development directories in: $PROJECT_DIR"

# 3. Local Node.js Installation (Darwin x64 for Intel Mac)
NODE_VER="v22.22.3"
if [ ! -f "$NODE_DIR/bin/node" ]; then
  echo "Downloading portable Node.js $NODE_VER..."
  mkdir -p "$NODE_DIR"
  curl -sS "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-darwin-x64.tar.gz" | tar -xz -C "$NODE_DIR" --strip-components=1
fi

# 4. Local Rust Environment Redirection
export RUSTUP_HOME="$CARGO_DIR/rustup"
export CARGO_HOME="$CARGO_DIR/cargo"
export PATH="$NODE_DIR/bin:$CARGO_HOME/bin:$PATH"

if ! command -v rustup &>/dev/null; then
  echo "Installing project-local Rust Toolchain..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path --default-toolchain stable
fi

# 5. Local PNPM Setup (Pinned to v9 for Big Sur compatibility)
if [ ! -f "$NODE_DIR/bin/pnpm" ]; then
  echo "Installing project-local PNPM (v11)..."
  npm install -g pnpm@latest-11 --prefix "$NODE_DIR"
fi

# 6. Generate the Portable activate.sh Script (Supports Bash and Zsh)
echo "Generating local shell activation script..."
cat << 'EOF' > "$PROJECT_DIR/activate.sh"
# Sourced by the user: source activate.sh

# Portably detect the absolute path of this file when sourced in Bash or Zsh
if [ -n "${BASH_SOURCE[0]:-}" ]; then
  # Bash
  SCRIPT_PATH="${BASH_SOURCE[0]}"
elif [ -n "${ZSH_VERSION:-}" ]; then
  # Zsh
  SCRIPT_PATH="${(%):-%x}"
else
  # Fallback
  SCRIPT_PATH="$0"
fi

# Resolve directories
PROJECT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
NODE_DIR="$PROJECT_DIR/tools/node_env"
CARGO_DIR="$PROJECT_DIR/tools/cargo_env"

export RUSTUP_HOME="$CARGO_DIR/rustup"
export CARGO_HOME="$CARGO_DIR/cargo"
export PATH="$NODE_DIR/bin:$CARGO_HOME/bin:$PATH"

echo "--------------------------------------------------------"
echo "Environment activated."
echo "Project Dir: $PROJECT_DIR"
echo "Node:        $(node -v 2>/dev/null || echo 'not found')"
echo "PNPM:        $(pnpm -v 2>/dev/null || echo 'not found')"
echo "Cargo:       $(cargo --version 2>/dev/null || echo 'not found')"
echo "--------------------------------------------------------"
EOF
chmod +x "$PROJECT_DIR/activate.sh"

# 7. Check for project manifest inside the app container
if [ -f "$APP_DIR/package.json" ]; then
  echo "Installing node dependencies..."
  cd "$APP_DIR" && pnpm install
else
  echo "App workspace is currently empty. Skipping dependency installation until scaffolded."
fi

echo "--------------------------------------------------------"
echo "Setup Complete! Run the following command to enter the dev shell:"
echo "source activate.sh"
echo "--------------------------------------------------------"
