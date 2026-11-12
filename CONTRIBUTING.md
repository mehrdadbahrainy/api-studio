# Contributing

Issues and pull requests are welcome. Keep additions focused, locally testable and safe for untrusted request/response content.

Before a pull request:

1. Run `npm run test:core`.
2. Run `npm run typecheck` and `npm run build`.
3. If request behavior changes, add a core unit test for the change.
4. If making network/permission changes, document the new capability scope and the risk.

Please avoid telemetry, mandatory accounts, implicit execution of imported requests, and external icon/CDN runtime dependencies.
