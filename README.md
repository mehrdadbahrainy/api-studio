# API Studio

> [!WARNING]
> **Known v0.1.1 Windows startup issue (under investigation):** The preview installer can crash on startup in some Windows environments. A native Windows CI test reproduces exit code `0xC0000005` on Windows Server 2025; automated installer checks did not detect this. **Do not rely on v0.1.1 for production work.** See [issue #3](https://github.com/mehrdadbahrainy/api-studio/issues/3) and use [v0.1.0 preview](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.0) if it works in your environment. Back up your workspace before changing versions.

A lightweight, local-first REST client built with **Angular 21** and **Tauri 2**.

**No account, sync server or API key is needed to use the app itself.** Work with HTTP requests and keep your collections, environments and history on your own machine. **Desktop v0.1.1 uses a password-protected Stronghold vault; browser preview still uses unencrypted localStorage.**

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

**Latest preview:** [API Studio v0.1.1](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.1) (Windows x64 EXE and MSI installers, SHA-256 checksums). Previous version: [v0.1.0](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.0). Release assets do not have the short retention window of GitHub Actions artifacts. First-time users of desktop v0.1.1 must create and remember a workspace passphrase (minimum 12 characters); existing v0.1.0 users should export a private backup before updating.

These preview installers are **unsigned**, so Windows may warn about an unverified publisher. Automated tests, installer packaging and MSI installation/removal checks run in GitHub Actions; unlocking the encrypted desktop vault and its migration flow have not been independently tested through a real user-driven Windows UI session. There is no backend to configure and no sign-in step. Linux and macOS users can build from source using the instructions below.

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

- **Secrets (desktop v0.1.1)**: saved requests, tokens and environment values use an encrypted Stronghold workspace protected by a user-chosen passphrase (Argon2). No passphrase recovery is provided. On the first successful unlock, the unencrypted v0.1.0 data is migrated and only then removed. Browser preview remains unencrypted. JSON exports may contain credentials and must be kept private.
- **History**: no body content, URL query values, form values, credentials or sensitive headers are retained. Legacy history is sanitized on import/migration. Replaying exact requests from history requires re-entering stripped data.
- **HTTP**: sending credentials to an `http://` URL is unencrypted. Use HTTPS for sensitive APIs.
- **Untrusted APIs**: desktop requests can reach arbitrary HTTP(S) addresses, including local services, by design. Only send requests to endpoints you trust. Imported workspaces do not execute automatically.
- **Response preview**: text is displayed up to 5 MiB; large and binary responses do not have a full preview. File attachments, gRPC, WebSocket, multipart upload, scripts/tests, synchronization and tabs are out of scope for v0.1.
- **Installer signing**: the release workflow does not sign Windows/macOS binaries, so OS warnings are possible. The v0.1.1 CI adds an MSI install/uninstall smoke test on a clean Windows runner. Generated release drafts should be reviewed before publishing.
- **Source build**: the source can be built on supported platforms, but the ZIP is not itself a ready-to-run installer.
- **Updates**: the in-app Check for updates action compares installed version with public GitHub Releases, without downloading or automatically installing anything. Signed automatic updates require additional setup.

## Release workflow

The CI workflow runs unit tests, browser E2E, Angular build, Windows desktop packaging and clean Windows MSI installation/removal checks. The `.github/workflows/publish-v0.1.1.yml` workflow publishes a **public prerelease** from a fresh verified build on the merged main branch, with downloadable Windows installers and a SHA-256 checksum file. It can also be run manually through GitHub Actions.

For future version tags, the `.github/workflows/release.yml` workflow creates a draft cross-platform release for review.

## License

MIT. See [LICENSE](LICENSE).

## v0.1.1 notes

- Desktop Stronghold vault encrypts saved workspace and environment values with a user-chosen passphrase; browser preview does not use this vault.
- Legacy workspace migration only removes the unencrypted storage entry after an encrypted save has succeeded. Export a private backup of v0.1.0 data before updating.
- History removes request bodies, query values, credentials and sensitive headers. Replaying sanitized entries may require re-entering parameters.
- Requests support cancellation, a 30-second timeout and safer network error messages.
- Manual update checks compare installed version with public releases; the application does not auto-install updates.
- **Verification limit:** CI tests packaging, browser E2E and MSI install/uninstall. A user-driven desktop UI test of Stronghold unlock and migration is still recommended. This is an unsigned preview release.
