# API Studio

**A lightweight, local-first REST API client for Windows.** Build, send, organize and inspect HTTP requests without creating an account or running a cloud service.

[![CI](https://github.com/mehrdadbahrainy/api-studio/actions/workflows/validate.yml/badge.svg?branch=main)](https://github.com/mehrdadbahrainy/api-studio/actions/workflows/validate.yml) [![Release](https://img.shields.io/github/v/release/mehrdadbahrainy/api-studio?label=stable)](https://github.com/mehrdadbahrainy/api-studio/releases/latest) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**[Download latest Windows x64 release](https://github.com/mehrdadbahrainy/api-studio/releases/latest)** · **[راهنمای فارسی](QUICKSTART.fa.md)** · [Changelog](CHANGELOG.md) · [Report an issue](https://github.com/mehrdadbahrainy/api-studio/issues)

## What you can do

- **Send REST requests:** GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS; headers, query parameters, JSON, plain text, URL-encoded and text-only multipart bodies.
- **Organize work:** collections, saved requests, local request history and environments with `{{baseUrl}}` / `{{token}}` variables.
- **Import from Postman:** Collection JSON v2.0/v2.1 and Environment JSON, added to the current workspace without overwriting existing collections. Review warnings for unsupported items.
- **Navigate comfortably:** expand/collapse individual collections or all at once; filter requests; drag the sidebar edge to resize it (228–480 px), or collapse it into a 68 px navigation rail. Layout preferences survive restart.
- **Read responses:** status, elapsed time, headers and JSON/plain-text response body; cancel requests and use keyboard shortcuts.
- **Work locally:** native desktop HTTP via Tauri, without browser CORS restrictions; no mandatory API Studio account, sync server or telemetry.
- **Protect saved data on Windows:** CurrentUser DPAPI automatically encrypts desktop workspace data; an additional application passphrase is optional.

API Studio is built with **Angular 21 + Tauri 2** and licensed under **MIT**. The verified public installers are **Windows x64 only**; the browser development preview has different storage and network restrictions.

## v0.2.2 — Corrective release for local Windows QA

This new patch packages the **source fixes found by local testing of v0.2.1**. The previously published v0.2.1 installer does not contain these fixes.

- **No silent field truncation (P1):** oversized request bodies, URLs, credentials or table rows are rejected *before* Save/Import/Restore. A failed save preserves the previous stored workspace and the current unsaved edits.
- **Dialog keyboard isolation (P2):** opening Help/About or other modals blocks Ctrl+Enter and other background request shortcuts. Focus is kept within the active dialog and restored on close.
- **Windows storage validation:** the same size/shape constraints apply before DPAPI or optional passphrase-encrypted persistence. A corrupt or over-limit original is preserved, not rewritten.
- Unit, browser real HTTP and installed Windows MSI regression tests verify these cases. See [local QA finding](docs/qa/v0.2.1-field-integrity.md) and [Issue #20](https://github.com/mehrdadbahrainy/api-studio/issues/20).

**Upgrade precautions:** export a private workspace backup first. Old data already truncated by earlier releases cannot be reconstructed automatically. Actual native OS file picker, legacy v0.1.2 vault migration and personal-profile destructive cases remain unverified. Do not regard CI success as a guarantee for all Windows configurations.

## v0.2.1 — Windows QA stability patch

**Historical v0.2.1 patch (now superseded by v0.2.2):** v0.2.1 replaced v0.2.0 before later local QA revealed the two additional issues described above. Four verified Windows/local HTTP QA defects were fixed in source after v0.2.0 was already published, so its previously published installer was not retroactively patched:

- Workspace backup validation now rejects excessive Collections/environments and duplicate saved request IDs **without truncating data**.
- Request duration includes streamed response-body download.
- Oversized responses explain the 5 MB transport limit instead of offering an unavailable binary download.
- Request History captures the request actually sent rather than subsequent edits to its open tab.

These changes are a backwards-compatible corrective release, not a change to the workspace format. The previous v0.2.0 binaries and tags are intentionally immutable. Read [the patch changelog](CHANGELOG.md) and [Windows QA evidence](docs/qa/windows-v0.2.0.md) for test scope and untested native OS cases. Export a **private** backup before upgrading. Native Windows DPAPI data belongs to the original Windows account. Windows installers remain unsigned.

## New in v0.2.0

- **Multiple request tabs:** keep several requests open, with independent drafts and response views, unsaved change indicators, Save/Discard/Cancel on close and recovery of saved tabs after restart.
- **Collection folders:** create nested folders, move Collections without changing their requests, and move a saved request to another Collection using **Save to / Move**. Imported Postman folders are represented as navigable folders without changing the original JSON backup version.
- **Response inspection:** choose Formatted or Raw for JSON, XML, HTML or text, with inert text-only markup, a large-response preview limit, Copy and Save Response. Raw downloads are plaintext and may contain secrets.
- **Help & About:** in-app quickstart, links to GitHub source, README, Persian guide, changelog, issues and MIT license.
- **Update notifications:** checks GitHub Releases on desktop startup and on demand, shows the installed and latest stable version, and opens the official release in your browser. **No automatic installer download or silent update.**

## Install and get started

1. Download the **EXE** or **MSI** from [the latest stable release](https://github.com/mehrdadbahrainy/api-studio/releases/latest). Compare the installer hash with `SHA256SUMS.txt` if needed.
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
- XML and HTML structured mode formats **text for inspection**, it does not execute HTML, JavaScript, scripts or network content. Response bodies above 5 MB are not retained by the current HTTP transport.
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

[Windows v0.2.0 QA coverage and known limitations](docs/qa/windows-v0.2.0.md)
distinguishes installed Windows observations, real localhost HTTP tests, browser
storage simulations and outstanding native acceptance. Unreleased source fixes
do not change the existing v0.2.0 installer. Requests currently run one at a time;
finish or cancel an active request before switching tabs.

Every stable release is gated on full unit/typecheck/Angular build, Chromium HTTP and UI E2E, a real Windows installer build and installed MSI/WebView2 startup, migration, restart and uninstall acceptance. The publisher reuses **the exact passing main commit's installers**, generates SHA256SUMS and never overwrites an existing release. [v0.1.4 release evidence](https://github.com/mehrdadbahrainy/api-studio/actions/runs/44063915754) is retained as history. Automated tests cannot prove compatibility on every Windows machine.

## What's next?

Next releases focus on import usability, daily productivity and, later, a **script-free API Scenario Runner** that extracts values (such as a login token or order ID) from one request and passes them to the next. Git-friendly scenario files, headless CLI, JUnit XML and GitHub Actions integration are **planned, not available in v0.2.0**.

See the [product roadmap](https://docs.google.com/document/d/1c_9gC-7vhMQzgogBgm7DevEEXRd6-hEq9JKLcoTYneg/edit), [CHANGELOG](CHANGELOG.md), and [CONTRIBUTING](CONTRIBUTING.md). Suggestions and bug reports are welcome via [GitHub Issues](https://github.com/mehrdadbahrainy/api-studio/issues).

## License

[MIT](LICENSE).
