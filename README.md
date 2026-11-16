# API Studio

> [!WARNING]
> **Known v0.1.1 Windows startup issue:** The preview installer can crash on startup in some Windows environments. A native Windows CI test reproduces exit code `0xC0000005` on Windows Server 2025; automated installer checks did not detect this. **Do not rely on v0.1.1 for production work.** See [issue #3](https://github.com/mehrdadbahrainy/api-studio/issues/3) and use [v0.1.0 preview](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.0) if it works in your environment. Back up your workspace before changing versions.

A lightweight, local-first REST client built with **Angular 21** and **Tauri 2**.

**No account, sync server or API key is needed to use the app itself.** Work with HTTP requests and keep your collections, environments and history on your own machine. **Desktop v0.1.2 uses a password-protected AES-256-GCM encrypted workspace file; browser preview still uses unencrypted localStorage.**

## Features

- GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS
- Headers and query parameters with enable/disable toggles
- Request bodies: JSON, plain text and `application/x-www-form-urlencoded`, and text-only multipart FormData
- Bearer token and Basic authentication
- Variables such as `{{baseUrl}}` and `{{token}}` in URLs, headers, parameters and payloads
- JSON response formatting, response headers, status, time, size and error messages
- Collections, request editing, history, local persistence
- Import and export the workspace as JSON
- Browser preview, native desktop app, keyboard shortcuts
- Included `Getting started` collection with an example request

![Tauri desktop](https://img.shields.io/badge/desktop-Tauri%202-24C8DB) ![Angular](https://img.shields.io/badge/frontend-Angular%2021-DD0031) ![License](https://img.shields.io/badge/license-MIT-64748b)

## Download and use

**Recommended Windows release:** [API Studio v0.1.2](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.2) (x64 EXE, MSI and SHA-256 checksums). **Do not use the v0.1.1 preview for new work:** it can crash on Windows startup. Before upgrading, export a private JSON backup where possible.

The installers are unsigned, and Windows may warn about an unverified publisher. Automated QA covers Angular production build, unit tests, Chromium E2E, native Windows process startup, installed MSI WebView2 vault acceptance (migration, restart, saved data, wrong password, privacy) and MSI uninstallation. Results from CI do not prove compatibility with every Windows computer. The app requires no backend or account.

### Requirements for development

- Node.js 22.12+ (22.22+ recommended) and npm
- Rust stable with Cargo, installed using [rustup](https://rustup.rs)
- Tauri 2 system prerequisites for your OS (WebView2 for Windows, WebKitGTK development libraries on Linux, Xcode tools on macOS). See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

### Run as a desktop app

```bash
npm install
npm run desktop:dev
```

Tauri starts the Angular development server and opens the native app. In the desktop build, requests use the **Tauri HTTP plugin** and are not subject to browser CORS.

### Build an installer

```bash
npm install
npm run desktop:build
```

On success, find the installer in `src-tauri/target/release/bundle/`. Do not commit build artifacts.

### Browser-only preview

```bash
npm install
npm start
```

Open `http://127.0.0.1:4200`. The same UI works in a browser, but cross-origin requests still obey CORS. Use the desktop build for general-purpose API testing.

### Quality checks

```bash
npm run test:core
npm run typecheck
npm run build
```

The included Node tests cover variable interpolation, URL and header validation, auth, JSON handling, workspace imports and history redaction. GitHub Actions runs these checks on pushes and pull requests.

## Quick start

1. Launch API Studio. The **Getting started** collection contains a GET request to a public example API.
2. Click **Send**. View status, time, size and formatted JSON response.
3. Change the method and URL, edit query parameters and headers, then **Save request** to a collection.
4. Use **No environment → Manage environments** to create variables and select an active environment.
5. Use the `···` menu to import or export a workspace. The import replaces the local workspace only after confirmation.

**Shortcuts**: `Ctrl/Cmd + Enter` send, `Ctrl/Cmd + S` save, `Ctrl/Cmd + N` new request.

## Architecture

```text
Angular UI (request editor, collections, history)
     │
     ├─ Request utilities (validation, interpolation, auth, body encoding)
     ├─ Workspace (browser WebView localStorage, import/export JSON)
     │
     └─ HTTP transport
           ├─ Tauri desktop → Rust-backed HTTP client (no CORS)
           └─ Browser preview → browser fetch (CORS applies)
```

- The `src/app/core` package keeps request preparation and state normalization separate from the Angular template.
- No telemetry, sign-in, or remote storage is implemented.
- Interface icons are a locally bundled subset of Lucide (ISC license included in `src/assets`).
- Desktop permissions allow user-specified `http` and `https` destinations, including custom ports, because API testing requires arbitrary hosts.
- Importing a collection **never automatically sends** its requests.
- Any data inserted into the response viewer is rendered as **text**, not executable HTML.

### Security and limitations

- **Secrets (desktop v0.1.2 candidate)**: saved requests, tokens and environment values are encrypted with WebCrypto AES-256-GCM using a PBKDF2-SHA256 key derived from a user-chosen passphrase and random per-workspace salt. Tauri only stores ciphertext in the app-local data folder. No password recovery is provided. The unencrypted v0.1.0 data is removed only after encrypted save succeeds. Existing v0.1.1 Stronghold snapshots are detected and never overwritten automatically; import a private JSON backup for migration. Browser preview remains unencrypted. JSON exports may contain credentials and must be kept private.
- **History**: no body content, URL query values, form values, credentials or sensitive headers are retained. Legacy history is sanitized on import/migration. Replaying exact requests from history requires re-entering stripped data.
- **HTTP**: sending credentials to an `http://` URL is unencrypted. Use HTTPS for sensitive APIs.
- **Untrusted APIs**: desktop requests can reach arbitrary HTTP(S) addresses, including local services, by design. Only send requests to endpoints you trust. Imported workspaces do not execute automatically.
- **Response preview**: text is displayed up to 5 MiB; large and binary responses do not have a full preview. File attachments, gRPC, WebSocket, multipart upload, scripts/tests, synchronization and tabs are out of scope for v0.1.
- **Installer signing**: the release workflow does not sign Windows/macOS binaries, so OS warnings are possible. The v0.1.1 CI adds an MSI install/uninstall smoke test on a clean Windows runner. Generated release drafts should be reviewed before publishing.
- **Source build**: the source can be built on supported platforms, but the ZIP is not itself a ready-to-run installer.
- **Updates**: the in-app Check for updates action compares installed version with public GitHub Releases, without downloading or automatically installing anything. Signed automatic updates require additional setup.

## Release workflow

The CI workflow runs unit tests, browser E2E, Angular build, Windows desktop packaging, installed Windows WebView2 acceptance and clean Windows MSI installation/removal checks. The `.github/workflows/publish-v0.1.2.yml` workflow publishes v0.1.2 only after the exact main commit passes all CI gates, reusing the tested Windows installers and generating SHA-256 checksums. The previous `publish-v0.1.1.yml` produced the known-broken preview.

For future version tags, the `.github/workflows/release.yml` workflow creates a draft cross-platform release for review.

## License

MIT. See [LICENSE](LICENSE).

## v0.1.1 notes

- Desktop encrypted vault encrypts saved workspace and environment values with a user-chosen passphrase; browser preview does not use this vault.
- Legacy workspace migration only removes the unencrypted storage entry after an encrypted save has succeeded. Export a private backup of v0.1.0 data before updating.
- History removes request bodies, query values, credentials and sensitive headers. Replaying sanitized entries may require re-entering parameters.
- Requests support cancellation, a 30-second timeout and safer network error messages.
- Manual update checks compare installed version with public releases; the application does not auto-install updates.
- **Verification limit:** CI tests packaging, browser E2E and MSI install/uninstall. A user-driven desktop UI test of Stronghold unlock and migration is still recommended. This is an unsigned preview release.

## v0.1.2 Windows startup fix

Native application startup on Windows Server 2025 reproducibly crashes with Stronghold initialization in v0.1.1. The v0.1.2 fix removes the crashing native plugin while keeping the desktop workspace encrypted at rest using WebCrypto AES-256-GCM and writing only encrypted data through narrowly scoped native Rust commands. The old v0.1.1 Stronghold file is never modified; if present, the new app blocks silent migration to prevent losing inaccessible data. A private JSON export from a working v0.1.1 app can be imported later. The v0.1.2 publishing workflow requires unit tests, browser E2E, installed-app WebView2 acceptance, clean install and uninstall on a Windows CI runner.
