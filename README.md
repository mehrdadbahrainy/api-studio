# API Studio

A lightweight, local-first REST client built with **Angular 21** and **Tauri 2**.

**No account, sync server or API key is needed to use the app itself.** Work with HTTP requests and keep your collections, environments and history on your own machine.

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

When this repository has a GitHub Release, open **Releases** and download the installer for your operating system. Install and launch API Studio. There is no backend to configure, and no sign-in step. The installers are built by the included release workflow on a `v*` Git tag.

> **Current artifact**: the source ZIP contains the full application, not a prebuilt Windows/macOS/Linux installer. To use the app before its first release, build it using the steps below.

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

- **Secrets**: saved requests and environment values are stored in **unencrypted localStorage** in the desktop WebView. Do not store production credentials or share backups containing tokens/passwords. History removes authorization-related header entries and token/password fields, but sensitive data in URLs and request bodies may remain in history.
- **HTTP**: sending credentials to an `http://` URL is unencrypted. Use HTTPS for sensitive APIs.
- **Untrusted APIs**: desktop requests can reach arbitrary HTTP(S) addresses, including local services, by design. Only send requests to endpoints you trust. Imported workspaces do not execute automatically.
- **Response preview**: text is displayed up to 5 MiB; large and binary responses do not have a full preview. File attachments, gRPC, WebSocket, multipart upload, scripts/tests, synchronization and tabs are out of scope for v0.1.
- **Installer signing**: the release workflow does not sign Windows/macOS binaries, so OS warnings are possible. Generated release drafts should be reviewed before publishing.
- **Source build**: the source can be built on supported platforms, but the ZIP is not itself a ready-to-run installer.

## Release workflow

The `.github/workflows/release.yml` workflow builds native installers on Windows, Linux and macOS from a tag such as `v0.1.0`. It creates a **draft** GitHub release so you can review the artifacts and publish them when verified.

```bash
git tag v0.1.0
git push origin main --tags
```

## License

MIT. See [LICENSE](LICENSE).
