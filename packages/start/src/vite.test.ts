import { describe, expect, test } from "bun:test";

import { transform } from "@barqjs/compiler-rs";

import { MANIFEST_ID, barqStart } from "./vite.ts";

/**
 * The three plugins `barqStart()` returns, as the loose shapes these tests
 * drive them through. Vite's `Plugin` types its hooks as object-or-function, so
 * calling one directly needs the narrower view.
 */
interface Loose {
  configResolved?: (config: unknown) => void;
  transform?: (code: string, id: string, options?: { ssr?: boolean }) => { code: string } | null;
  resolveId?: (id: string) => string | null;
  load?: (id: string) => string | null;
}

function byName(
  plugins: ReturnType<typeof barqStart>,
): [
  Required<Pick<Loose, "transform">> & Loose,
  Required<Pick<Loose, "resolveId" | "load">> & Loose,
  Loose,
] {
  const at = (name: string): Loose =>
    plugins.find((plugin) => plugin.name === name) as unknown as Loose;
  return [
    at("barq-compiler") as Required<Pick<Loose, "transform">> & Loose,
    at("barq-start:manifest") as Required<Pick<Loose, "resolveId" | "load">> & Loose,
    at("barq-start:dev"),
  ];
}

const SOURCE =
  `import { createServerFn } from "@barqjs/start";\n` +
  `import { db } from "./db";\n` +
  `export const getUser = createServerFn().handler(async (id) => db.query(id));\n` +
  `const internal = createServerFn().handler(async () => 1);\n` +
  `export const listUsers = createServerFn().handler(async () => db.all());\n`;

const ROOT = "/home/me/app";
const FILE = `${ROOT}/server/users.ts`;

/** The plugin pair, driven the way Vite drives it. */
function drive(): { manifest: string; stubs: string } {
  const [compiler, manifest, dev] = byName(barqStart());

  const config = { root: ROOT, mode: "development" };
  compiler.configResolved?.(config);
  dev.configResolved?.(config);

  // Vite hands the compiler a plugin context; only `warn` is reached here.
  const context = { warn: () => {} };
  const client = (
    compiler.transform as unknown as (
      this: unknown,
      code: string,
      id: string,
      options?: { ssr?: boolean },
    ) => { code: string } | null
  ).call(context, SOURCE, FILE, { ssr: false });

  const resolved = manifest.resolveId(MANIFEST_ID) as string;
  return { manifest: manifest.load(resolved) as string, stubs: client?.code ?? "" };
}

describe("the manifest", () => {
  /**
   * The property the whole plugin exists for. A client stub calls
   * `<module>#<export>` and the server mounts `<module>#<export>`; if the two
   * strings are derived separately they drift, and a call reaches nothing with
   * no error on either side. So the ids are compared as strings, not as rules.
   */
  test("mounts exactly the ids the client stubs call", () => {
    const { manifest, stubs } = drive();

    const called = [...stubs.matchAll(/clientRpc\("([^"]+)"\)/g)].map((m) => m[1]);
    const mounted = [...manifest.matchAll(/mount\("([^"]+)"/g)].map((m) => m[1]);

    expect(called).toEqual(["server/users.ts#getUser", "server/users.ts#listUsers"]);
    expect(mounted.toSorted()).toEqual(called.toSorted());
  });

  /** Export-ness decides the surface on both sides, not just in the compiler. */
  test("an internal server function is neither stubbed nor mounted", () => {
    const { manifest, stubs } = drive();
    expect(stubs).not.toContain("internal");
    expect(manifest).not.toContain("internal");
  });

  test("the client stubs carry no server code", () => {
    const { stubs } = drive();
    expect(stubs).not.toContain("db.query");
    expect(stubs).not.toContain("./db");
  });

  /** An app with no server functions still imports this module. */
  test("an empty manifest is a module rather than an error", () => {
    const [, manifest] = byName(barqStart());
    const code = manifest.load(manifest.resolveId(MANIFEST_ID) as string) as string;
    expect(code).toContain("export {}");
    expect(code).not.toContain("mount(");
  });
});

describe("the artifact the manifest is built from", () => {
  /**
   * The plugin re-derives the id rather than carrying the compiler's, so this
   * pins the compiler's own answer to the same rule. If the compiler changes
   * how it spells an id, this fails here rather than at runtime as a 404.
   */
  test("the compiler spells an id the same way the plugin does", () => {
    const out = transform(SOURCE, { filename: FILE, root: ROOT, env: "client", serverFns: true });
    expect(out.code).toContain('clientRpc("server/users.ts#getUser")');

    const artifact = JSON.parse(out.serverFns as string) as {
      exports: Array<{ name: string; serverFn: boolean }>;
    };
    expect(artifact.exports.filter((e) => e.serverFn).map((e) => e.name)).toEqual([
      "getUser",
      "listUsers",
    ]);
  });
});
