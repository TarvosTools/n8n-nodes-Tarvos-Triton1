# Release preparation

[Back to README](../README.md) · [Development](DEVELOPMENT.md) · [Validation](DEVNET-ACCEPTANCE.md)

The repository is source distribution for an evaluation build. Creating/pushing it does not publish the package to npm. Current package name: `n8n-nodes-tarvos-triton-one`; current version: `0.2.0`. Preserve the package identifier and registered node names when maintaining existing workflows.

## Before publication

1. Review outstanding provider/deployment gates and describe supported versus unverified behavior in the release notes.
2. Update the version and lockfile together. Record compatibility changes in CHANGELOG.md.
3. Install root and worker dependencies from their locks, then run typecheck, lint, build, all tests and actual n8n runtime checks.
4. Generate examples and the operation contract; ensure they match committed files.
5. Run `npm pack --dry-run` and inspect the archive. It must include compiled nodes, icons, credentials, protobuf notices and documentation, and exclude local credentials, databases, logs, node_modules and test reports.
6. Install the tarball in a disposable self-hosted n8n instance. Verify discovery, wallet connector, dynamic choices and one read-only workflow.
7. Review dependency advisories, platform behavior and MIT/optional-worker AGPL obligations. Local test success is not a security-clearance claim.

```sh
npm ci
npm ci --prefix worker --ignore-scripts
npm run test:setup-runtime
npm run test:offline
npm pack --dry-run
npm pack
```

GitHub Actions runs Windows/Linux checks on pushes and pull requests. A configured workflow is not evidence a run passed; inspect the run results. Provider credentials are not required by CI and must not be added to fixtures.

## Eventual npm publication

A maintainer needs access to the npm package name under the intended publisher account and the required authentication/2FA or trusted-publishing configuration. Review npm's current publisher requirements at release time. The package requests public access and provenance; provenance must be generated in a supported publishing environment. Do not claim provenance merely because a package.json field is present.

Publication should follow an explicit release decision. This repository intentionally has no workflow that publishes merely on push or tag creation. After publishing, verify the registry version, integrity, package contents and clean installation before updating the README's installation status.

## n8n verification

npm publication and n8n verification are distinct. This package currently targets self-hosted n8n and uses runtime dependencies plus an optional external worker. Do not label it verified or n8n Cloud compatible without the applicable review. See [n8n community-node documentation](https://docs.n8n.io/integrations/community-nodes/).

## Upgrade procedure

Back up workflows, credentials and n8n's encryption key through your normal operational process. Install the new package in every execution environment and restart active nodes/workers. Compare node versions and fields before resuming production workflows. Reconcile pending transaction signatures and outstanding worker receipts before retrying them.
