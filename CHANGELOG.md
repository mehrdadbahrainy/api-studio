# Changelog

Installer files and SHA-256 checksums remain on [GitHub Releases](https://github.com/mehrdadbahrainy/api-studio/releases). Unreleased fixes below do not modify previously published installers.

## Unreleased — Windows QA fixes

- Reject over-capacity or ambiguous-identity workspace backups instead of silently losing Collections/environments; enforce matching interactive creation limits and preserve saved-request capacity independently of History.
- Include response-body download in request duration, retain the 5 MB response diagnostic, and record the sent draft in History even when the editor changes during transport.
- Expand real localhost HTTP coverage, import/capacity/keyboard regressions and disposable installed-MSI/WebView2 HTTP/import acceptance. Native destructive tests refuse personal-profile execution.
- Document [actual Windows QA coverage and outstanding checks](docs/qa/windows-v0.2.0.md). A patched release requires separate owner approval; v0.2.0 assets remain unchanged.

## [v0.2.0](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.2.0) — 2026-11-19

- Multi-request tabs with per-tab draft/response state, save-discard-cancel on close and saved-tab restoration after restart.
- Nested Collection folders, moving Collections and moving saved requests between Collections without deleting existing requests.
- Raw/Formatted response inspection for JSON, XML and HTML, safe text-only markup, bounded preview, Copy and Save Response.
- Help/About with links to source, README, Persian guide, changelog, issue tracker and license.
- Safe desktop startup/manual GitHub stable-release checks and an update-available notice with the official download link, no silent installation.
- Native browser opening for allowlisted official project URLs.
- Preserve Postman JSON import and DPAPI encrypted Windows storage, with updated unit, browser and installed Windows MSI acceptance.

## [v0.1.4](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.4) — 2026-11-17

- Expand and collapse individual Collections or all at once, including imported Collections; preserve their layout preferences after restart.
- Resize the sidebar with the splitter (228–480 px) or keyboard; collapse to a compact 68 px rail and reopen it.
- Improve Lucide icon alignment, action-button geometry, navigation spacing and responsive behavior.
- Keep Postman import, secure desktop storage and existing request workflows unchanged.
- Verified [full Windows/Chromium CI](https://github.com/mehrdadbahrainy/api-studio/actions/runs/44063915754) and [successful publication](https://github.com/mehrdadbahrainy/api-studio/actions/runs/44065235512).

## [v0.1.3](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.3) — 2026-11-17

- Add Postman Collection v2.0/v2.1 and Environment JSON import without removing existing workspace collections.
- Start fresh Windows desktop installs without mandatory app passphrase, using Windows CurrentUser DPAPI.
- Offer an optional application passphrase and migration path for existing v0.1.2 password-protected vaults.
- Add parser, browser and Windows installed MSI regression tests.

## [v0.1.2](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.2) — 2026-11-16

- Resolve the v0.1.1 Windows startup regression for the stable installer.
- Replace problematic Stronghold startup dependency with WebCrypto AES-256-GCM/PBKDF2 encrypted workspace persistence.
- Improve data migration, save verification and installed-Windows acceptance tests.

## [v0.1.1](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.1) — 2026-11-16 (Preview)

- Early security/reliability work. **Known native startup crash on some Windows environments. Not recommended for new installations.**

## [v0.1.0](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.0) — 2026-11-13 (Preview)

- Initial Angular + Tauri desktop REST client with request editing, Collections, Environments, History and browser E2E coverage.

## Roadmap (not released)

Script-free Scenario Runner, cross-request variables, version-controlled scenario/Collection files, headless CLI, JUnit reports and GitHub Actions integration are planned for later milestones. See the [product roadmap](https://docs.google.com/document/d/1c_9gC-7vhMQzgogBgm7DevEEXRd6-hEq9JKLcoTYneg/edit).
