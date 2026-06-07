# DEVELOPER_GUIDE.md

## Section 1: The Original Project Brief (Beginning Prompt)

```markdown
You are a senior software architect, Rust engineer, and desktop application developer.

I want to build a desktop AI coding assistant similar to Claude Code Desktop, but with a provider-agnostic backend. The application must support multiple AI providers, including:

- Anthropic Claude API
- OpenAI API
- Google Gemini API
- OpenRouter
- Ollama (local models)
- LM Studio (local models)
- Future providers through a plugin/extensible architecture

Target platform:

- macOS Big Sur (Intel MacBook Pro)
- Tauri v2
- Rust backend
- React + TypeScript frontend

Important development constraints:

1. I strongly prefer a self-contained development environment.
2. I do NOT want to install unnecessary packages globally on my laptop.
3. All project dependencies, SDKs, tools, scripts, build artifacts, and development utilities should live inside the project folder whenever possible.
4. If a dependency must be installed globally, explain why and provide alternatives.
5. The project should be easy to delete completely by removing a single directory.
6. Prefer portable tooling, local binaries, project-local package managers, and reproducible builds.

Project goals:

- Claude Code-like desktop experience
- Chat interface
- Multi-provider model selection
- Local and remote model support
- Conversation history
- Streaming responses
- Tool/function calling
- File system access (with permission controls)
- Code editing assistance
- Project/workspace management
- Terminal command execution (sandboxed where possible)
- Settings management
- Model configuration UI
- API key management
- Prompt templates
- Future MCP (Model Context Protocol) support
- Future plugin architecture

## Very Critical Compatibility Requirement (Applies to the Entire Project)

**THIS REQUIREMENT OVERRIDES ALL OTHER RECOMMENDATIONS.**

My primary development and testing environment is:

- macOS Big Sur 11.7.11
- Intel MacBook Pro
- Safari 16.6.1
- WebKit 16615.3.12.11.5 (16615)

You must treat these platform versions as hard constraints throughout the entire project lifecycle.

For every recommendation you make—including architecture decisions, frameworks, libraries, Rust crates, Node packages, build tools, APIs, browser features, frontend code, backend code, Tauri configuration, development tooling, deployment methods, and testing strategies—you must verify and explicitly consider compatibility with:

- macOS Big Sur 11.7.11
- Safari 16.6.1
- The corresponding WebKit version
- Intel x86_64 Macs
```

---

## Section 2: Core Platform & Compatibility Constraints

_Developers and LLMs working on this codebase must adhere strictly to these constraints to prevent build crashes or runtime panics on the target machine:_

1. **No JavaScript Lookbehind Regular Expressions:** Safari 16 (Big Sur WebKit) does not support Lookbehind operators (`(?<=...)` or `(?<!...)`) and will throw a fatal syntax error, rendering a blank white screen [1]. Use sequential index searches (`indexOf`) for parsing strings.
2. **PostCSS with Tailwind CSS v3 Only:** Do not upgrade to Tailwind CSS v4. Tailwind v4 relies on modern CSS compilation utilities that compile down to system library binaries incompatible with macOS Big Sur's Unix kernel. Use the configured PostCSS compilation wrapper with Tailwind v3.
3. **Rust `keyring` Crate Feature Flags:** When dealing with keychain services on macOS Big Sur, the `keyring` crate must use version `3.x` with the `apple-native` feature flag. Standard configurations may fail due to deprecated C-bindings on macOS 11.
4. **Keyring Access Fallback:** Unsigned local development binaries may be blocked from writing to the macOS Keychain by the operating system. The application must silently fall back to storing encrypted or local API keys inside a SQLite `settings` table if Keychain writes fail.
5. **No `react-markdown`:** The `react-markdown` package and its standard syntax parsers rely on Lookbehind Regex patterns that crash Safari 16. All markdown must be rendered using the custom, regex-free parser located in `app/src/utils/markdown.tsx`.
6. **No External System Node.js or Rust:** The developer environment is entirely self-contained. Always run `source activate.sh` before executing cargo or npm tools to ensure the project-local `tools/node_env` and `tools/cargo_env` binaries are active.

---

## Section 3: Summary of Technical Achievements (Milestones 1–7)

### Milestone #1: Scaffolding, Portable Environment & Big Sur Compatibility Workarounds

- **Agnostic Local Workspace:** Developed the `setup.sh` and `activate.sh` scripts to download and build project-local Node 20 LTS, PNPM 9, and Rust toolchains into `tools/`, exposing an isolated development sandbox. Scaffolded the Tauri v2 application within the sub-contained `app/` directory.
- **Compilation Guardrails:** Fixed Vite compilation errors by pinning `esbuild` to `0.24.2`. Suppressed Rust core panics under Big Sur by overriding `objc2` debug assertions with `debug-assertions = false` in `Cargo.toml`. Set the window target to load in fullscreen mode on boot inside `tauri.conf.json`.

### Milestone #2: Local Database, Secure Storage, and Dynamic VPN/Proxy Client Setup

- **SQLite Storage Layer:** Configured `rusqlite` to compile statically with the application. Coded `db.rs` to initialize and seed five core AI providers (Anthropic, OpenAI, Gemini, Ollama, LM Studio).
- **Bypass Proxy Loops:** Implemented `.no_proxy()` client configuration blocks within our Rust `reqwest` handlers to prevent connection timeouts when local VPN proxies (Xray/Vless) intercept `localhost` subnets.
- **Secure API Fallback:** Programmed a secure credential writer that stores keys in the native macOS Keychain via `keyring` (v3). If keychain authorization fails for unsigned dev binaries, keys are securely persisted in a local SQL settings table instead.

### Milestone #3: Secure Sandbox Directories & Lookbehind-Free Chat Engine

- **Directory Access:** Integrated `tauri-plugin-dialog` to let users safely select a workspace root directory, and configured capabilities inside `default.json` to unblock native popup dialogs.
- **Path Sanitizer:** Wrote a strict path-sanitization algorithm (`sanitize_path`) in Rust that checks canonical parent structures to prevent path-traversal attacks.
- **Double-Token Fix:** Removed `<React.StrictMode>` from `main.tsx` to prevent duplicate streaming token rendering.
- **Safari-Safe Render Engine:** Avoided standard lookbehind-heavy markdown libraries by building `markdown.tsx` to safely format code blocks, bold text, inline code backticks, and ordered/unordered lists.

### Milestone #4: Supervised Loop, Code Writer, and Terminal Runner

- **Stream Processing Loop:** Leveraged `tokio::process` to spawn `/bin/sh` shells within the selected workspace directory, piping stdout/stderr logs and streaming them in real-time to a modular UI slide-out terminal console.
- **Supervised Actions:** Implemented `<execute_command>` and `<write_file>` XML tags in the model's system prompt. Built an interactive confirmation card on the frontend that requires an explicit user click before running commands or writing code.
- **Context Feedback Loop:** Designed the executor to capture execution outputs (success and failure tracebacks) and feed them back to the chat history to enable self-correcting agent behavior [1].

### Milestone #5: Model Discovery, Saved Mappings, and Prompt Preview/Edit Modal

- **Dynamic Discovery:** Programmed a universal Rust command `fetch_provider_models` that queries endpoints (OpenAI, Ollama, LM Studio, Gemini, Anthropic), handles API-specific schemas, and returns sorted model arrays to populate selection dropdowns [1].
- **Hot-Swappable Proxy Rules:** Added a custom bypass exceptions list in the Settings UI that synchronizes with the system `NO_PROXY`/`no_proxy` environment variables in Rust on the fly.
- **Debugging Overlay:** Developed `PromptPreviewModal`, triggered via **`Cmd+Enter`** or **`Ctrl+Enter`**, allowing developers to inspect, edit, and send the exact pre-compiled context payload (system rules + files + user prompts) before dispatching to the model [1].

### Milestone #6: Search-and-Replace Patching, Folding Explorer, and Checked-Context Compiler

- **Aider Search-and-Replace Engine:** Programmed `patch_workspace_file` in Rust, utilizing a custom parser to process `<patch_file>` blocks using Aider's original/updated syntax format (`<<<<<<< SEARCH / ======= / >>>>>>> REPLACE`). This allows files to be edited incrementally without full rewrites.
- **Compile-Free `.gitignore` Walker:** Wrote a recursive directory walker in Rust that parses `.gitignore` patterns, wildcards, and directories without external dependencies, defaulting to a standard list of folders (e.g., `node_modules`, `target`) if no `.gitignore` is found.
- **Hierarchical Checkbox Sidebar:** Built a collapsible, folder-first explorer sidebar with links to expand or collapse directories. Integrated cascading checkbox selections to allow users to easily include or exclude directories in the AI context.
- **Indigo Hover Transition:** Styled the sidebar's checkboxes with a layout-preserving hover transition (`opacity-0` until hovered or checked) to prevent layout shifting.
- **Multi-File Prompt Compiler:** Built a Rust command `compile_selected_files_prompt` that formats checked files into a unified context prompt, complete with an ASCII directory tree.

### Milestone #7: Resizable Layout, Editable Code Canvas, History Pruning, and Persistence

- **Drag-to-Resize Layout**: Implemented horizontal and vertical mouse resizers for the Sidebar, Chat Panel, and Terminal. Uses zero-dependency vanilla JS/TS mouse handlers to avoid WebKit compatibility issues [1].
- **Editable Code Canvas**: Modified the CodeMirror editor to allow editing. Implemented dirty tab indicators (`*`), a header Save button, and a global **`Cmd+S`** / **`Ctrl+S`** key listener to write edits directly to disk.
- **Conversational History Pruning**: Added checkboxes to chat messages. Users can selectively include or exclude past messages from the context. These pruned messages are automatically formatted into the model's unified context block.
- **Targeted In-Place Reruns**: Refactored the streaming engine around a mutable reference pointer (`streamingMessageId`). Rerunning an intermediate user message compiles the active files context, grabs prior selected history, and streams the new response in-place—leaving all subsequent messages in the conversation thread unaltered.
- **Relational Database Persistence**: Created SQLite tables (`workspaces`, `workspace_tabs`, `workspace_selected_files`, `workspace_messages`) to save and reload workspace states. Reopening a workspace folder instantly restores opened tabs, active focus, selected checkboxes, and message histories.

---

## Section 4: Architectural Blueprint & Code Reference Map

This reference map outlines where core logic resides:

```
app/
├── src-tauri/
│   ├── src/
│   │   ├── db.rs          # SQL Schema init, Default Prompts, Proxy parsers
│   │   ├── secrets.rs     # macOS Keychain writes & SQLite fallbacks
│   │   ├── providers/
│   │   │   └── mod.rs     # Proxy-aware network clients & ping tests
│   │   ├── commands.rs    # Model discoverers, settings savers, proxy re-syncs
│   │   ├── workspace.rs   # S&R Patches, Gitignore walker, Context compilers, Workspace State loaders
│   │   ├── chat.rs        # Main LLM SSE stream processor, prompt separators
│   │   ├── terminal.rs    # Command executors, Stdout/Stderr line emitters
│   │   └── lib.rs         # Tauri plugin mounts, dynamic NO_PROXY boot syncing
│   └── Cargo.toml         # Suppressed objc2 debug assertions
├── src/
│   ├── types/
│   │   └── index.ts       # Shared ChatMessage, ProviderStatus & EditorTab models
│   ├── utils/
│   │   ├── parser.ts      # Lookbehind-free sequential Multi-Tag XML parser
│   │   └── markdown.tsx   # Lookbehind-free custom paragraph and syntax renderer
│   ├── components/
│   │   ├── Header.tsx     # Section navigation tabs
│   │   ├── WorkspaceSidebar.tsx # Collapsible folder tree with Indigo checkboxes
│   │   ├── CodeViewer.tsx # Editable CodeMirror canvas with dirty indicators & save bindings
│   │   ├── ChatPanel.tsx  # Resizable panel, rerun triggers, checkbox selection
│   │   ├── TerminalConsole.tsx  # Resizable vertical console displaying stream logs
│   │   ├── SettingsPanel.tsx    # Models selector dropdown, Prompt editor, Proxy rules
│   │   └── PromptPreviewModal.tsx # Expandable payload modal (Cmd+Enter)
│   ├── App.tsx            # Main state coordinator & vanilla mouse handlers
│   └── App.css            # Contenteditable cursor focus overrides
```

---

## Section 5: Guidelines for Future Agent Development

_When generating code, modifying logic, or extending features, future coding assistants must follow these rules:_

1.  **Do Not Touch Regular Expressions in Parsers:** Do not replace index searches in `app/src/utils/parser.ts` or `app/src/utils/markdown.tsx` with RegExp matchers. Doing so will break compatibility with Safari 16 on macOS Big Sur.
2.  **Respect Rust thread-safety boundaries:** When editing `app/src-tauri/src/commands.rs` or `workspace.rs`, always release database locks by wrapping SQL queries in block scopes `{ ... }` before executing async `.await` calls to prevent database deadlocks.
3.  **Validate Parameter Names on the IPC Bridge:** Tauri converts camelCase arguments in frontend JS into snake_case arguments in Rust. Ensure frontend invocations match exactly (e.g. `{ workspacePath }` matches `workspace_path: String` in Rust).
4.  **Preserve the Dirty Tab Indicators:** When implementing new workspace commands, ensure that editing a file inside the editor tabs sets `isDirty: true` and that clicking save writes to disk and resets `isDirty: false`.
5.  **Maintain the Streaming Message Pointer:** In-place stream updates must target `streamingMessageId`. Do not modify the array indexes directly, as this will break targeted intermediate reruns.
6.  **Maintain SQLite Fallback Logic:** When modifying keychain logic in `secrets.rs`, always keep the fallback query block to allow the app to store API keys in SQLite if native macOS Keychain access is blocked.
