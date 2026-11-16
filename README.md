# API Studio

A lightweight, local-first REST API client built with **Angular 21** and **Tauri 2**. Designed for developers who want to open an API workspace and start sending requests without account setup.

> **Release status:** v0.1.2 is the latest verified public release until v0.1.3 finishes installed-Windows acceptance and is published. v0.1.1 was a broken preview with a native Windows startup regression. Do not use it for new projects.

## What it can do

- GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS, with URL parameters and headers.
- JSON, text, URL-encoded and **text-only** multipart FormData request bodies.
- Bearer and Basic authentication, environment variables such as \`{{baseUrl}}\` and \`{{token}}\`.
- Collection management, request editing, history, local persistence, JSON response formatting, status/timing/headers.
- Import/export an API Studio workspace backup (full restore asks for explicit confirmation).
- **v0.1.3:** Import Postman Collection v2.0/v2.1 or Postman Environment JSON and add it to the current workspace without deleting saved collections.
- **v0.1.3 Windows:** Start immediately with no app password. Windows CurrentUser DPAPI protects the workspace on disk. Enable an optional passphrase in **Workspace actions → Security settings**.
- Native desktop HTTP requests through Tauri (without browser CORS restrictions), browser-only preview for development, shortcuts and manual update check.

## Download

- **Published stable:** [v0.1.2 for Windows x64](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.2).
- v0.1.3 is being tested. **Do not download branch artifacts as a final installer.** Its release will appear on [GitHub Releases](https://github.com/mehrdadbahrainy/api-studio/releases) only after the exact final commit passes Windows native acceptance.
- Installers are currently unsigned; Windows may show a SmartScreen or unverified publisher warning.

## Getting started (v0.1.3)

1. Launch API Studio. A clean Windows install opens without entering an app password.
2. Select \`Getting started → Get a sample TODO\`, then click **Send**.
3. Choose your own method and URL; add parameters, headers, body or authorization; **Save request** to a collection.
4. Open the \`···\` workspace menu to import a Postman Collection or Environment JSON. The app detects the file type. A Postman import **adds** data; a native API Studio restore **replaces** the workspace only after confirmation.
5. Use **Security settings** if you want an additional app passphrase. It must have 12 or more characters and will be requested on subsequent launches.

**Shortcuts:** \`Ctrl/Cmd + Enter\` sends, \`Ctrl/Cmd + S\` saves, \`Ctrl/Cmd + N\` opens a new request.

## Security and upgrade notes

- **Fresh Windows v0.1.3:** Workspace is encrypted at rest by Windows DPAPI under the **current Windows user account**. This avoids an app passphrase prompt but does not make data portable to another Windows profile or computer. If Windows account credentials are reset by an administrator, Windows is reinstalled, or the profile is lost, protected files may become inaccessible. **Export a private backup before major OS changes.**
- **Existing v0.1.2:** A user with a password-protected encrypted workspace needs to enter that old passphrase **once**. Only after verification does v0.1.3 create its Windows-protected copy. The prior encrypted file is preserved as a private recovery snapshot.
- **Existing v0.1.1:** Stronghold snapshots remain untouched and are not automatically recoverable. Keep their AppData files and a private JSON export if you have one. Never delete old files before a verified backup.
- **Optional passphrase in v0.1.3:** When enabled, WebCrypto PBKDF2-SHA256 (600,000 rounds) and AES-256-GCM protect the native file with your chosen passphrase. The passwordless copy is removed only **after** a verified encrypted save. Removing an enabled passphrase switches back to Windows CurrentUser protection.
- **Browser-only preview:** LocalStorage is not encrypted by Windows DPAPI. It also cannot bypass CORS. Do not store production secrets in browser-only mode.
- **JSON export/import:** Export files are **plaintext** and can contain API keys and other secrets. Store them privately. Imported Postman scripts and tests are never executed. Unsupported auth types, script actions and file-upload fields may need manual migration.
- **Request history:** Request bodies, credentials, sensitive headers and query values are removed, including during migration.
- **Network:** Prefer HTTPS for credentials. API Studio allows intentionally user-entered HTTP(S) destinations, including private/local endpoints, in the native client.

## Development

Requirements: Node.js 22.12+ (22.22+ recommended), Rust stable, and [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for the target OS (WebView2 on Windows).

\`\`\`bash
npm install --no-audit --no-fund
npm run desktop:dev
# Browser-only development:
npm start
# Validation:
npm run test:core
npm run typecheck
npm run build
npm run test:e2e
# Native release installers:
npm run desktop:build
\`\`\`

Desktop installers appear in \`src-tauri/target/release/bundle/\`. Source downloads alone are **not** installable Windows binaries.

### Architecture

\`\`\`text
Angular standalone UI (request editor, collections, settings)
    ├─ src/app/core/request-utils.ts — request validation and auth
    ├─ src/app/core/import-json.ts — Postman and native workspace parsing
    ├─ src/app/core/workspace-utils.ts — safe normalization / history redaction
    ├─ src/app/core/system-workspace.ts — Windows passwordless protected persistence
    ├─ src/app/core/secure-workspace.ts + vault-crypto.ts — optional password mode
    ├─ Tauri Rust commands — Windows DPAPI & atomic file persistence
    └─ HTTP transport — Tauri native HTTP / browser fetch
\`\`\`

No sign-in, server-side sync or telemetry is required to use the application. More advanced capabilities including file attachments, gRPC, WebSocket, scripting, tabs and scenario execution are roadmap items; they are **not implemented** in v0.1.3.

### QA and releases

CI runs fresh install, unit tests, TypeScript checks, Angular production build, Chromium E2E against a local HTTP fixture and Windows 2025 native installer build. The Windows installed MSI acceptance exercises a real WebView2 window: default passwordless opening, migration from legacy workspace, save/restart, optional passphrase, wrong-passphrase error, history privacy, and uninstall.

**Release gate:** Only a successful CI run on the exact current \`main\` SHA may publish v0.1.3 installers; publication reuses the exact tested MSI/EXE and attaches SHA-256 checksums. No suite can prove that software has zero defects on every Windows system.

For the planned product roadmap (through v0.4.0), see the [project document](https://docs.google.com/document/d/1c_9gC-7vhMQzgogBgm7DevEEXRd6-hEq9JKLcoTYneg/edit). User-facing API Scenario Runner and CLI/JUnit integration remain separate future milestones.

## License

MIT. See [LICENSE](LICENSE).
