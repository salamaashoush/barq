/**
 * Points every `@barqjs/*` range in the create-barq templates at the version
 * this workspace is about to publish.
 *
 * A template is copied into somebody else's project, so it names a published
 * range rather than `workspace:*`, and `changeset version` does not see it.
 * Run after it, as `version-packages` does; `scaffold.test.ts` fails when the
 * two disagree.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const templates = join(root, "packages/create-barq/templates");

type Manifest = Record<string, unknown> & {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function versionOf(name: string): string {
  const manifest = JSON.parse(
    readFileSync(join(root, "packages", name.slice("@barqjs/".length), "package.json"), "utf8"),
  ) as { version: string };
  return manifest.version;
}

for (const template of readdirSync(templates)) {
  const path = join(templates, template, "package.json");
  const manifest = JSON.parse(readFileSync(path, "utf8")) as Manifest;
  for (const group of [manifest.dependencies, manifest.devDependencies]) {
    for (const name of Object.keys(group ?? {})) {
      if (group && name.startsWith("@barqjs/")) group[name] = `^${versionOf(name)}`;
    }
  }
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
