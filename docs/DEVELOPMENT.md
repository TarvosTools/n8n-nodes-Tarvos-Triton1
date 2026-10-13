# Development

Use `npm ci`, `npm run typecheck`, `npm run lint` and `npm test`. `npm run build` uses the official n8n node CLI. Generate examples and the operation contract after metadata changes with `node scripts/generate-examples.cjs`. Inspect the resulting tarball using `npm pack --dry-run`.

`scripts/runtime-smoke.cjs /absolute/path/to/n8n/node_modules` exercises the installed n8n engine and its real `supplyData` resolution. Set `N8N_USER_FOLDER` to a disposable directory before running it. The test creates ephemeral, unfunded in-memory keys and does not send network transactions. Unit tests use synthetic RPC responses; actual provider capability checks remain a separate opt-in activity.

The ESLint config uses the official self-hosted preset with narrow documented exceptions: pinned signing dependencies, domain errors converted at node boundaries, deliberate omission of AI-agent wrapping, public program-ID constants, a metadata factory and the legacy credential-test helper required by the installed API. Passing this lint configuration does not imply n8n Cloud verification.

Keep the package lock reproducible. Development and CI use Node 24.11.0 and npm 11.6.1, matching the validated local toolchain. CI installs on Windows and Linux, runs checks, builds and inspects the package. The package runtime minimum is distinct from the development toolchain: some development dependencies require Node 24. npm 10 rejects the npm 11-generated optional-peer dependency layout, so use the pinned npm version for source installs. Publishing is separate and must not occur while the release gates in `VALIDATION.md` remain open.

Development-only pins for `ignore` and `@emnapi/*` prevent an npm 11.6.1 hoisting/optional-dependency mismatch discovered by clean-install testing. They are lint resolver dependencies, not node runtime dependencies. Retest `npm ci` when changing these pins.
