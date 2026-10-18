/**
 * Writes `dist/intrinsics.json`: every tag this renderer's catalogue knows
 * without `extend`, which the compiler reads to send a JSX unit made of them
 * to this renderer. The list is derived from the installed `three`, so it is
 * never edited by hand and never falls behind a three release.
 *
 *   bun run tools/intrinsics.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";

import { catalogueTags } from "../src/intrinsics.ts";

const out = join(import.meta.dir, "..", "dist");
mkdirSync(out, { recursive: true });
const tags = catalogueTags(THREE);
writeFileSync(join(out, "intrinsics.json"), `${JSON.stringify(tags, null, 2)}\n`);
console.log(`dist/intrinsics.json: ${tags.length} tags`);
