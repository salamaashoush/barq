/**
 * The type-level channel, because nothing else in the suite can see a type.
 *
 * Every other oracle here compiles a fixture and runs it. A JSX ATTRIBUTE TYPE
 * is invisible to all of them, and both files in this directory exist because
 * of a slot that was WRONG while every fixture over it was green: `<form
 * action={fn}>` was declared `string`, and `bind:` was not declared at all. So
 * this shells out to `tsc` over `src/jsx-types` alone — its own tsconfig, so
 * core's pre-existing errors are not in scope and a green run means what it
 * says.
 *
 * Both directions matter. The positives must compile, and every
 * `@ts-expect-error` must FIRE — an expectation that stops being an error is
 * itself an error, which is the half a hand-read never does and the reason the
 * negatives are in the file at all.
 */

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function typecheck(): { status: number; output: string } {
  const result = spawnSync("bunx", ["tsc", "--noEmit", "--pretty", "false", "-p", HERE], {
    cwd: join(HERE, "..", ".."),
    encoding: "utf8",
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

describe("the JSX attribute types this directory declares", () => {
  test("the accepted shapes compile and every refused one is still refused", () => {
    const { status, output } = typecheck();
    // A non-zero exit is either a positive that stopped compiling or a
    // `@ts-expect-error` that stopped firing (TS2578), and tsc names which.
    expect(output).toBe("");
    expect(status).toBe(0);
  }, 60_000);
});
