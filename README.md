# API Studio

A lightweight, local-first REST API client built with **Angular 21** and **Tauri 2**. Designed for developers who want to open an API workspace and start sending requests without account setup.

> **Latest stable release:** [API Studio v0.1.3](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.3) (Windows x64 EXE/MSI). Verified on the exact [main CI run #44043330519](https://github.com/mehrdadbahrainy/api-studio/actions/runs/44043330519) at commit `b8dfc33148508111d0916cae2037a5e259d85f2e` and published by [workflow #44044496663](https://github.com/mehrdadbahrainy/api-studio/actions/runs/44044496663). The v0.1.1 preview had a Windows startup regression; do not use it for new projects.

## What it can do

Items below are included in published v0.1.3 unless marked as future roadmap. Earlier v0.1.2 requires a password and does not import Postman JSON.


- GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS, with URL parameters and headers.
- JSON, text, URL-encoded and **text-only** multipart FormData request bodies.
- Bearer and Basic authentication, environment variables such as \`{{baseUrl}}\` and \`{{token}}\`.
- Collection management, request editing, history, local persistence, JSON response formatting, status/timing/headers.
- Import/export an API Studio workspace backup (full restore asks for explicit confirmation).
- **v0.1.3:** Import Postman Collection v2.0/v2.1 or Postman Environment JSON and add it to the current workspace without deleting saved collections.
- **v0.1.3 Windows:** Start immediately with no app password. Windows CurrentUser DPAPI protects the workspace on disk. Enable an optional passphrase in **Workspace actions → Security settings**.
- Native desktop HTTP requests through Tauri (without browser CORS restrictions), browser-only preview for development, shortcuts and manual update check.

## Download

- **Latest stable Windows x64:** [v0.1.3 (EXE, MSI and SHA256SUMS)](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.3).
- **Previous stable:** [v0.1.2](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.2). Its Postman import is unsupported and its desktop passphrase is mandatory.
- The published v0.1.3 EXE/MSI are from the exact successful main commit; verify their download with the attached `SHA256SUMS.txt`. Do not use historical branch artifacts as installers.
- Installers are currently unsigned; Windows may show a SmartScreen or unverified publisher warning.

## Getting started with v0.1.3

These instructions apply to **v0.1.3**. The older v0.1.2 installer requires a mandatory passphrase and cannot import a Postman JSON collection.


1. Launch API Studio. A clean Windows install opens without entering an app password.
2. Select \`Getting started → Get a sample TODO\`, then click **Send**.
3. Choose your own method and URL; add parameters, headers, body or authorization; **Save request** to a collection.
4. Open the \`···\` workspace menu to import a Postman Collection or Environment JSON. The app detects the file type. A Postman import **adds** data; a native API Studio restore **replaces** the workspace only after confirmation.
5. Use **Security settings** if you want an additional app passphrase. It must have 12 or more characters and will be requested on subsequent launches.

**Shortcuts:** \`Ctrl/Cmd + Enter\` sends, \`Ctrl/Cmd + S\` saves, \`Ctrl/Cmd + N\` opens a new request.

## Security and upgrade notes

These notes describe the **published v0.1.3 Windows desktop release**. Windows CurrentUser protection is not portable between profiles or machines. Export a private backup before upgrading important workspaces or making major OS/account changes.


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

**Release evidence:** [CI #44043330519](https://github.com/mehrdadbahrainy/api-studio/actions/runs/44043330519) passed all four jobs at `b8dfc33148508111d0916cae2037a5e259d85f2e`; [publication #44044496663](https://github.com/mehrdadbahrainy/api-studio/actions/runs/44044496663) reused that exact CI installer artifact and published SHA-256 checksums. Future releases must pass the same gates. CI cannot guarantee zero defects on all Windows devices.

For the planned product roadmap (through v0.4.0), see the [project document](https://docs.google.com/document/d/1c_9gC-7vhMQzgogBgm7DevEEXRd6-hEq9JKLcoTYneg/edit). User-facing API Scenario Runner and CLI/JUnit integration remain separate future milestones.

## Project records and decisions

- [Project management and roadmap through v0.4.0](https://docs.google.com/document/d/1c_9gC-7vhMQzgogBgm7DevEEXRd6-hEq9JKLcoTYneg/edit) — product decisions, evidence, risk log, milestones and acceptance criteria.
- [v0.1.3 milestone / acceptance issue #7](https://github.com/mehrdadbahrainy/api-studio/issues/7) and [merged PR #8](https://github.com/mehrdadbahrainy/api-studio/pull/8) — completed implementation and verification evidence.
- [Contributing](CONTRIBUTING.md) — validation commands and policy for safe feature development.

The product owner controls direction and release acceptance. Previous autonomous project-manager delegation is inactive; historical notes are retained in Drive only for traceability. New features and material roadmap changes require approval. No background agent is implicitly running because documents exist.

## License

MIT. See [LICENSE](LICENSE).
