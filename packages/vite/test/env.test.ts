/**
 * Typed environment variables: `start.env` and the two `virtual:env` modules.
 *
 * The schema is written by hand against the Standard Schema interface, which
 * is the whole contract, so the suite needs no validation library.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createBuilder } from "vite";

import { ENV_TYPES_FILE } from "../src/index.ts";
import { cleanUp, project } from "./project.ts";

afterAll(cleanUp);

const SCHEMA = `
const text = (min: number) => ({
  "~standard": {
    version: 1,
    vendor: "salama",
    validate: (value: unknown) =>
      typeof value === "string" && value.length >= min
        ? { value }
        : { issues: [{ message: "expected at least " + min + " characters" }] },
  },
});

export default {
  server: { DATABASE_URL: text(8) },
  client: { VITE_APP_NAME: text(1) },
};
`;

const SECRET = "postgres://salama@db.example.com/app";

const ROUTE = `
import { createFileRoute } from "@barqjs/router";
import { env } from "virtual:env/server";

export const Route = createFileRoute("/api/config")({
  server: {
    handlers: {
      GET: () => Response.json({ name: env.VITE_APP_NAME, database: env.DATABASE_URL.length }),
    },
  },
});
`;

function app(main: string, dotenv: string): string {
  const root = project("spa", {
    "env.ts": SCHEMA,
    ".env": dotenv,
    "src/routes/api/config.ts": ROUTE,
    "src/title.ts": main,
  });
  const entry = join(root, "src", "main.tsx");
  writeFileSync(entry, `import "./title.ts";\n${readFileSync(entry, "utf8")}`);
  return root;
}

async function build(root: string): Promise<void> {
  const builder = await createBuilder({ root, configLoader: "runner", logLevel: "silent" });
  await builder.buildApp();
}

const read = (directory: string): string =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
    .join("\n");

describe("`start.env`", () => {
  test("client values are written in, server values are read when the server starts", async () => {
    const root = app(
      `import { env } from "virtual:env/client";\ndocument.title = env.VITE_APP_NAME;\n`,
      `VITE_APP_NAME=salama-demo\nDATABASE_URL=${SECRET}\n`,
    );
    await build(root);

    const client = read(join(root, "dist", "client"));
    expect(client).toContain("salama-demo");
    expect(client).not.toContain(SECRET);
    expect(read(join(root, "dist", "server"))).not.toContain(SECRET);

    const service = (await import(
      pathToFileURL(join(root, "dist", "server", "index.js")).href
    )) as {
      default: { fetch(request: Request): Promise<Response> };
    };
    const response = await service.default.fetch(new Request("http://localhost/api/config"));
    expect(await response.json()).toEqual({ name: "salama-demo", database: SECRET.length });
  }, 60_000);

  test("the types are inferred from the schema, beside it", async () => {
    const root = app(`export {};\n`, `VITE_APP_NAME=salama-demo\nDATABASE_URL=${SECRET}\n`);
    await build(root);
    const types = readFileSync(join(root, ENV_TYPES_FILE), "utf8");
    expect(types).toContain('declare module "virtual:env/client"');
    expect(types).toContain('readonly "VITE_APP_NAME"');
    expect(types).toContain('declare module "virtual:env/server"');
    expect(types).toContain('readonly "DATABASE_URL"');
  }, 60_000);

  test("the server module in the browser bundle fails the build", async () => {
    const root = app(
      `import { env } from "virtual:env/server";\nconsole.log(env);\n`,
      `VITE_APP_NAME=salama-demo\nDATABASE_URL=${SECRET}\n`,
    );
    await expect(build(root)).rejects.toThrow("is imported by the browser bundle");
  }, 60_000);

  test("a client value that does not validate fails the build, naming it", async () => {
    const root = app(`export {};\n`, `VITE_APP_NAME=\nDATABASE_URL=${SECRET}\n`);
    await expect(build(root)).rejects.toThrow("VITE_APP_NAME: expected at least 1 characters");
  }, 60_000);
});
