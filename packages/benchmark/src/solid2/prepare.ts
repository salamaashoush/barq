/**
 * Build Solid 2.0 from a local solid-next checkout into `SOLID2_DIR`.
 *
 *   SOLID_NEXT=~/Workspace/vendor/solid-next bun run bench:solid2:prepare
 *
 * The checkout is copied rather than built in place, so the vendor tree stays
 * as it was cloned. What is built is what the lane resolves: `@solidjs/signals`,
 * `solid-js`, `@solidjs/web` and the native `@solidjs/compiler`, which is the
 * compiler `@solidjs/vite-plugin` uses by default.
 */
import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { SOLID2_DIR, SOLID_NEXT, solid2Version } from "./solid2.ts"

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed in ${cwd}`)
  return result.stdout
}

mkdirSync(SOLID2_DIR, { recursive: true })
run(
  "rsync",
  ["-a", "--delete", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "target", `${SOLID_NEXT}/`, `${SOLID2_DIR}/`],
  SOLID_NEXT,
)
writeFileSync(join(SOLID2_DIR, ".commit"), run("git", ["rev-parse", "HEAD"], SOLID_NEXT))

run("pnpm", ["install", "--ignore-scripts"], SOLID2_DIR)
const packages = join(SOLID2_DIR, "packages")
run("pnpm", ["run", "build:js"], join(packages, "signals"))
run("pnpm", ["run", "build:js"], join(packages, "solid"))
run("pnpm", ["run", "build"], join(packages, "web"))
run("pnpm", ["run", "build"], join(packages, "compiler"))

const version = solid2Version()
console.log(`Solid ${version.solid} (signals ${version.signals}) at ${version.commit} built in ${SOLID2_DIR}`)
