# Contributing to API Studio

API Studio is a local-first Angular 21 + Tauri 2 REST client. We welcome focused issues and pull requests that improve real user workflows without compromising saved workspaces, security or desktop reliability.

## Project sources of truth

- [Product decisions, UX principles and roadmap through v0.4.0](https://docs.google.com/document/d/1c_9gC-7vhMQzgogBgm7DevEEXRd6-hEq9JKLcoTYneg/edit) — plans and acceptance criteria.
- [GitHub Issues](https://github.com/mehrdadbahrainy/api-studio/issues) — execution and defects.
- [Pull Requests and checks](https://github.com/mehrdadbahrainy/api-studio/pulls) — code review, test evidence and pending work.
- [Releases](https://github.com/mehrdadbahrainy/api-studio/releases) — only published, installable builds.

The product owner approves new product ideas and significant changes to milestones, security posture or user-facing direction. Historic autonomous project-manager notes are archived, not active delegation.

## Development workflow

1. Open or reference an Issue with a user scenario, scope, acceptance criteria and known migration/data-safety risks.
2. Branch from a known baseline and keep changes limited to the approved scope. Do not update `main` with unreviewed experimental features.
3. Add unit/regression tests for parsers, storage, request behavior and error handling. Use representative Postman and workspace fixtures rather than relying only on mock examples.
4. Cover visible UX behavior with Playwright and include negative cases (invalid input, cancellation, storage failure, save/restart).
5. Open a PR summarizing behavior, screenshots when UI changes, tests performed, known limitations, migration risks and exact evidence links.
6. Merge only after review and successful required CI checks; a successful build is not proof of a working installed desktop application.

## Local verification

```bash
npm install --no-audit --no-fund
npm run test:core
npm run typecheck
npm run build
npm run test:e2e
```

Desktop build (Rust and Tauri prerequisites required):

```bash
npm run desktop:build
```

The CI workflow also builds real Windows installers and checks process startup and **installed MSI WebView2** behavior on Windows Server 2025. This includes the primary workspace and upgrade journeys, not just Angular in a browser.

## Data and security requirements

- Import is **not** execution: do not run imported Postman scripts or requests automatically. Clearly report unsupported auth/body modes and skip unsupported file attachments safely.
- Importing Postman Collection or Environment must preserve current Collections, History and settings. Native API Studio backup restore must require explicit replacement confirmation.
- Never delete a legacy workspace before a verified readback of the migrated copy. Add tests for wrong passwords, failed writes, interruption and rollback. Keep old Stronghold and encrypted vault files intact unless a verified, approved cleanup is safe.
- Never log access tokens, passwords, private paths, raw request bodies or sensitive environment values. JSON workspace exports are plaintext and may contain secrets.
- Do not add telemetry, a mandatory account, an external service dependency, or runtime CDN assets without approval and a privacy/security review.
- Treat Windows DPAPI as tied to the user's Windows security context, **not** as a portable backup. Tell users to keep private backups before OS or account migration.

## Release policy

- Stable publicly available version is **v0.1.2** until a verified v0.1.3 GitHub Release exists; draft branch artifacts are not public releases.
- The v0.1.3 work is in [Issue #7](https://github.com/mehrdadbahrainy/api-studio/issues/7) / [draft PR #8](https://github.com/mehrdadbahrainy/api-studio/pull/8). Do not close the issue or mark the PR complete until Import, DPAPI, optional passphrase, legacy migration and Windows installer E2E are all accepted.
- Keep version strings aligned in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and displayed UI/docs.
- A stable release must use the **exact commit** whose CI passed all gates: unit, typecheck, production Angular build, Chromium E2E, native executable, installed MSI WebView2 acceptance and uninstall.
- Publish matching Windows EXE/MSI installers, SHA256 checksums, release notes, supported-platform scope, migration guidance and explicit limitations. If any P0 gate fails, **do not publish**.

The differentiating future roadmap remains a *script-free API Scenario Runner*, followed by Git-friendly scenario files and running the same tests through CLI, JUnit XML and GitHub Actions. Those are planned features, not implemented in v0.1.3.
