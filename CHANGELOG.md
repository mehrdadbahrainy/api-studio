# Changelog

This file records public releases, not unfinished work. Installer files and SHA-256 checksums remain on [GitHub Releases](https://github.com/mehrdadbahrainy/api-studio/releases).

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
