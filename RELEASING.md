# Releasing

Every package under `packages/` that is not `private` is published from CI,
in one fixed version group: they always share a version. The platform
packages of `@barqjs/compiler` (`packages/compiler/npm/*`) are in the
group too, because the compiler pins them exactly.

## Day to day

1. A change that should reach npm carries a changeset: `bun run changeset`,
   pick the bump, write one line for the changelog, commit the file it writes.
2. On every push to `main`, the Release workflow opens or updates a pull
   request titled "chore: version packages". It runs `bun run version-packages`:
   `changeset version`, then the create-barq templates are pointed at the new
   version, then `bun install` refreshes `bun.lock`.
3. Merging that pull request publishes. The workflow builds the native binding
   for every target, smoke-tests each on a machine that can run it, packs and
   checks every package (`.github/scripts/publish.ts`), publishes the versions
   npm does not have yet with provenance, and pushes a tag and a GitHub release
   per package.

The repository is in prerelease mode (`.changeset/pre.json`, tag `next`), so
versions come out as `0.2.0-next.0`, `0.2.0-next.1`, and publish under the
`next` dist-tag. A package npm has never seen is published under `latest`
instead, because npm cannot install a package by name without one. Leave prerelease mode with
`bun run changeset pre exit` when a version should become `latest`.

npm never accepts a version twice, even after an unpublish. The first release
from this repository is `0.2.0-next.0` because `@barqjs/core` and
`@barqjs/testing` already have a `0.1.0` on npm from an older codebase.

## Before merging a version PR

Run the dry run from the Actions tab: Release, "Run workflow" on `main`. It does
everything the publish does except publish, including `npm publish --dry-run`
for every package. Locally, after `bun run build:packages`:

```sh
bun run pack:check
bun .github/scripts/publish.ts --dry-run
```

Locally only this machine's binding exists; the others are reported as skipped.

## If a publish fails halfway

Re-run the failed jobs. The script skips every version npm already has, so a
re-run publishes only what is missing.

## One-time setup

GitHub, in the repository settings:

- Environments: create `npm` and add yourself as a required reviewer, so every
  publish waits for an approval. Restrict it to the `main` branch.
- Actions, General: allow GitHub Actions to create and approve pull requests.
- Optional secret `RELEASE_PR_TOKEN`: a fine-grained token (or GitHub App
  token) with contents and pull-requests write on this repository. A pull
  request opened with the default token starts no workflows, so without it CI
  does not run on the version PR until it is closed and reopened.
- Branch protection on `main`: require the CI checks "Lint, format and types",
  "Rust (fmt, clippy, test)", "Test" and "Package quality".

npm, once per package:

- The first version of a package that is not on npm yet has to be published
  with a token, because a trusted publisher can only be attached to a package
  that exists. Create a granular access token with read and write on the
  `@barqjs` scope and on `create-barq`, store it as the `NPM_TOKEN` secret of
  the `npm` environment, and let the first release use it.
- Then, for every published package, add a trusted publisher: repository
  `salamaashoush/barq`, workflow `release.yml`, environment `npm`. From a shell
  logged in to npm (11.5.1 or later):

  ```sh
  npm trust github @barqjs/core --repo salamaashoush/barq --file release.yml --env npm
  ```

  Repeat for each package, the seven `@barqjs/compiler-*` included.
- Once every package trusts the workflow, delete `NPM_TOKEN` and set each
  package's publishing access to "Require two-factor authentication and
  disallow tokens".
- Deprecate the stale `0.1.0` of `@barqjs/core` and `@barqjs/testing`, which
  stay `latest` until a stable release replaces them:

  ```sh
  npm deprecate @barqjs/core@0.1.0 "Superseded by the 0.2 line; install @barqjs/core@next"
  npm deprecate @barqjs/testing@0.1.0 "Superseded by the 0.2 line; install @barqjs/testing@next"
  ```
