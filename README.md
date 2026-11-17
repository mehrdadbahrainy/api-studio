# API Studio

**A lightweight, local-first REST API client for Windows.** Build, send, organize and inspect HTTP requests without creating an account or running a cloud service.

[![CI](https://github.com/mehrdadbahrainy/api-studio/actions/workflows/validate.yml/badge.svg?branch=main)](https://github.com/mehrdadbahrainy/api-studio/actions/workflows/validate.yml) [![Release](https://img.shields.io/github/v/release/mehrdadbahrainy/api-studio?label=stable)](https://github.com/mehrdadbahrainy/api-studio/releases/latest) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**[Download v0.1.4 for Windows x64](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.4)** · **[راهنمای فارسی](QUICKSTART.fa.md)** · [Changelog](CHANGELOG.md) · [Report an issue](https://github.com/mehrdadbahrainy/api-studio/issues)

## What you can do

- **Send REST requests:** GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS; headers, query parameters, JSON, plain text, URL-encoded and text-only multipart bodies.
- **Organize work:** collections, saved requests, local request history and environments with `{{baseUrl}}` / `{{token}}` variables.
- **Import from Postman:** Collection JSON v2.0/v2.1 and Environment JSON, added to the current workspace without overwriting existing collections. Review warnings for unsupported items.
- **Navigate comfortably (new in v0.1.4):** expand/collapse individual collections or all at once; filter requests; drag the sidebar edge to resize it (228–480 px), or collapse it into a 68 px navigation rail. Layout preferences survive restart.
- **Read responses:** status, elapsed time, headers and JSON/plain-text response body; cancel requests and use keyboard shortcuts.
- **Work locally:** native desktop HTTP via Tauri, without browser CORS restrictions; no mandatory API Studio account, sync server or telemetry.
- **Protect saved data on Windows:** CurrentUser DPAPI automatically encrypts desktop workspace data; an additional application passphrase is optional.

API Studio is built with **Angular 21 + Tauri 2** and licensed under **MIT**. The verified public installers are **Windows x64 only**; the browser development preview has different storage and network restrictions.

## Install and get started

1. Download the **EXE** or **MSI** from [v0.1.4 Releases](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.4). Compare the installer hash with `SHA256SUMS.txt` if needed.
2. Open API Studio. A new installation on Windows starts without a separate app password.
3. Open the **Getting started** collection and send the sample request, or choose a method and URL of your own.
4. Save a request to a collection. Use the chevron on the collection heading to collapse/expand; drag the splitter at the sidebar edge to resize, or use the panel toggle to compact it.
5. From **Workspace actions**, import a Postman Collection/Environment JSON or export a private API Studio backup.

Shortcuts: `Ctrl+Enter` to send, `Ctrl+S` to save, `Ctrl+N` for a new request. The sidebar splitter also supports Arrow, Home and End keys.

**Older installations:** upgrading from the encrypted v0.1.2 workspace requires the previous passphrase once for migration. Keep a private backup before upgrades. The v0.1.1 Stronghold preview is not automatically migrated.

## Privacy and limitations

- **Windows DPAPI is tied to your Windows account/profile**, not a portable backup. Export a private backup before moving to another PC, resetting Windows credentials or reinstalling Windows.
- **JSON workspace exports are not encrypted** and can include access tokens or API keys. Keep them private. Browser-only development preview uses unencrypted localStorage.
- Unsupported Postman scripts/tests, advanced authentication and file-upload fields are not imported or executed automatically. Use the import warnings to check what needs manual setup.
- Windows installers are currently unsigned; Windows SmartScreen may show an unverified publisher warning.
- Native MSI import through the Windows file picker and migration using a vault created by an actual v0.1.2 binary are tracked as additional QA coverage in [issue #9](https://github.com/mehrdadbahrainy/api-studio/issues/9).

## Development

Requirements: Node.js 22.12+ (22.22+ recommended), Rust stable, and [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install --no-audit --no-fund
npm run desktop:dev      # Native desktop development
npm start                # Browser preview (CORS + localStorage limitations)
npm run test:core
npm run typecheck
npm run build
npm run test:e2e
npm run desktop:build    # Build target-platform installers
```

Source modules include `src/app/core/import-json.ts` (Postman conversion), `src/app/core/sidebar-state.ts` (UI-only layout preferences), `src/app/core/system-workspace.ts` (Windows protected storage), and Tauri commands in `src-tauri/src/`.

## Verification and releases

Release **v0.1.4** passed [full CI on the exact main commit](https://github.com/mehrdadbahrainy/api-studio/actions/runs/44063915754), including unit tests, type checks, Angular build, Chromium E2E for collections/sidebar/icon geometry and Postman import, a real Windows installer build, and installed MSI/WebView2 startup, migration, restart and uninstall checks. [Publication workflow](https://github.com/mehrdadbahrainy/api-studio/actions/runs/44065235512) succeeded; the release contains EXE, MSI and SHA-256 checksums. Automated checks cannot prove compatibility on every machine.

## What's next?

Next releases focus on import usability, daily productivity and, later, a **script-free API Scenario Runner** that extracts values (such as a login token or order ID) from one request and passes them to the next. Git-friendly scenario files, headless CLI, JUnit XML and GitHub Actions integration are **planned, not available in v0.1.4**.

See the [product roadmap](https://docs.google.com/document/d/1c_9gC-7vhMQzgogBgm7DevEEXRd6-hEq9JKLcoTYneg/edit), [CHANGELOG](CHANGELOG.md), and [CONTRIBUTING](CONTRIBUTING.md). Suggestions and bug reports are welcome via [GitHub Issues](https://github.com/mehrdadbahrainy/api-studio/issues).

## License

[MIT](LICENSE).
