/**
 * Writes `templates/manifest.json`: every file of every template, which is how
 * the CLI knows what to fetch from GitHub without listing a directory there.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { TEMPLATE_ROOT, manifestOf } from "../src/source.ts";
import { TEMPLATES } from "../src/templates.ts";

const manifest = manifestOf(
  TEMPLATE_ROOT,
  TEMPLATES.map((template) => template.name),
);
writeFileSync(join(TEMPLATE_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
