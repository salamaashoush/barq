/**
 * The published DECLARATIONS must widen a component's props at its call site.
 *
 * A component annotated honestly takes `Incoming<P>`, so every prop is an
 * `Accessor`. `JSX.LibraryManagedAttributes` inverts that for the caller, who
 * writes plain values because the compiler adds the thunk. If that inversion
 * does not survive into `dist`, nothing in this repository notices and every
 * consumer's `<Button onClick={fn}>Save</Button>` is a type error.
 *
 * INVISIBLE IN THE WORKSPACE, for the same reason `dist-entries.test.ts` is:
 * bun resolution takes `@barqjs/*` to `src/`, and `tsc` follows `types` to
 * `dist/`. Only the second is what anyone installs. This caught `dist` carrying
 * a `StrictAccessor` still gated on the deleted `COMPILER_MODE` flag, which made
 * the widening resolve to a bare `Accessor` and put 374 errors in
 * `packages/kitchen-sink` while every `src`-resolved gate stayed green.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, test } from "bun:test";

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const INDEX_DTS = fromHere("../dist/index.d.ts");
const JSX_DTS = fromHere("../dist/jsx-runtime.d.ts");
const TSC = fromHere("../../../node_modules/.bin/tsc");

const built = existsSync(INDEX_DTS) && existsSync(JSX_DTS) && existsSync(TSC);

const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** Typecheck one `.tsx` source against the BUILT declarations. */
async function check(source: string): Promise<{ ok: boolean; output: string }> {
  const dir = mkdtempSync(join(tmpdir(), "barq-dist-types-"));
  dirs.push(dir);

  writeFileSync(join(dir, "probe.tsx"), source);
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        lib: ["ESNext", "DOM"],
        jsx: "react-jsx",
        jsxImportSource: "@barqjs/core",
        paths: {
          "@barqjs/core": [INDEX_DTS],
          "@barqjs/core/jsx-runtime": [JSX_DTS],
        },
      },
      include: ["probe.tsx"],
    }),
  );

  const spawned = Bun.spawn([TSC, "--noEmit", "-p", "tsconfig.json"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(spawned.stdout).text(),
    new Response(spawned.stderr).text(),
    spawned.exited,
  ]);

  return { ok: code === 0, output: `${stdout}${stderr}` };
}

describe.if(built)("the published declarations, as a consumer sees them", () => {
  test("a component annotated `Incoming` is callable with plain values", async () => {
    const { ok, output } = await check(`
      import type { Child, Incoming } from "@barqjs/core";

      function Button(
        props: Incoming<{
          children: Child;
          onClick?: (e: MouseEvent) => void;
          variant?: "primary" | "danger";
        }>,
      ) {
        return (
          <button type="button" onClick={props.onClick?.()}>
            {props.children}
          </button>
        );
      }

      export function Use() {
        return (
          <Button variant="primary" onClick={() => {}}>
            Save
          </Button>
        );
      }
    `);

    expect(output).toBe("");
    expect(ok).toBe(true);
  });

  test("an accessor is still accepted where a value is", async () => {
    const { ok, output } = await check(`
      import { signal } from "@barqjs/core";
      import type { Incoming } from "@barqjs/core";

      function Label(props: Incoming<{ text: string }>) {
        return <span>{props.text}</span>;
      }

      export function Use() {
        const name = signal("x");
        return <Label text={name} />;
      }
    `);

    expect(output).toBe("");
    expect(ok).toBe(true);
  });

  test("a wrong value type is still an error", async () => {
    const { ok, output } = await check(`
      import type { Incoming } from "@barqjs/core";

      function Label(props: Incoming<{ text: string }>) {
        return <span>{props.text}</span>;
      }

      export function Use() {
        return <Label text={42} />;
      }
    `);

    expect(ok).toBe(false);
    expect(output).toContain("not assignable");
  });
});
