# Contributing to API Studio

API Studio is a local-first Angular + Tauri REST client. Focus on usability, predictable behavior, secure local persistence and reliable Windows desktop installs.

## Project references

- [Latest release — v0.1.4](https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.1.4) · [Changelog](CHANGELOG.md) · [Persian quickstart](QUICKSTART.fa.md)
- [Issues](https://github.com/mehrdadbahrainy/api-studio/issues) for reproducible bugs and approved work; [Pull Requests](https://github.com/mehrdadbahrainy/api-studio/pulls) for review and evidence.
- [Roadmap through v0.4.0](https://docs.google.com/document/d/1c_9gC-7vhMQzgogBgm7DevEEXRd6-hEq9JKLcoTYneg/edit) for product decisions and acceptance criteria. Product-direction changes require the owner's approval.

## Pull request checklist

1. Reference an issue and describe the user journey, acceptance criteria and known limitations.
2. Keep changes scoped; add unit tests for parsers/storage/request behavior and Playwright E2E for visible workflows.
3. Run `npm install --no-audit --no-fund`, `npm run test:core`, `npm run typecheck`, `npm run build`, and `npm run test:e2e`.
4. For desktop/security/upgrade behavior, use the CI Windows native MSI + installed WebView2/restart/uninstall tests before merging.
5. Summarize risks to existing workspaces. Verify saved data and migrations; never treat an MSI build alone as proof of usability.
6. Keep docs, version strings and release notes consistent; do not label unverified branch artifacts as stable releases.

## Security and compatibility

- Never execute imported Postman scripts or API requests automatically. Postman imports must preserve existing Workspace data and clearly warn on unsupported formats.
- Never log access tokens, passwords, sensitive headers or raw request bodies. JSON exports are unencrypted; DPAPI protection is bound to a Windows user, not portable.
- Never delete previous vaults before verified migration. Keep fallback behavior testable, including wrong password, disk failure and interrupted writes.
- Do not add telemetry, mandatory accounts, cloud dependencies or runtime CDN assets without product/security review.
- For additional native Postman File Picker and real v0.1.2-vault upgrade testing, see [QA issue #9](https://github.com/mehrdadbahrainy/api-studio/issues/9).

## Release policy

Stable releases must use the **exact source SHA** that passed unit checks, TypeScript/Angular, browser E2E, Windows installer build and installed MSI/WebView2 acceptance. Attach Windows x64 EXE, MSI, SHA256SUMS and clear security/upgrade notes. Keep past release binaries/tags unchanged.

[v0.1.4 full CI](https://github.com/mehrdadbahrainy/api-studio/actions/runs/44063915754) and [release workflow](https://github.com/mehrdadbahrainy/api-studio/actions/runs/44065235512) both succeeded. Additional releases must repeat the gates. CI does not guarantee compatibility with every Windows machine.

The planned script-free API Scenario Runner and later Git/CLI/JUnit/Actions support are **not** features of v0.1.4.
