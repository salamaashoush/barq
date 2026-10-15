import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { type Plugin, type ResolvedConfig, loadEnv, runnerImport } from "vite";

import { consumerOf } from "./environment.ts";

export const CLIENT_ENV_ID = "virtual:env/client";
export const SERVER_ENV_ID = "virtual:env/server";
const RESOLVED_CLIENT_ENV_ID = `\0${CLIENT_ENV_ID}`;
const RESOLVED_SERVER_ENV_ID = `\0${SERVER_ENV_ID}`;

const SCHEMA_FILES = ["env.ts", "env.js"];
export const ENV_TYPES_FILE = "barq-env.d.ts";

interface StandardIssue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[];
}

type StandardResult = { readonly value?: unknown; readonly issues?: readonly StandardIssue[] };

interface StandardSchema {
  readonly "~standard": {
    readonly validate: (value: unknown) => StandardResult | Promise<StandardResult>;
  };
}

interface EnvSchema {
  readonly server?: Record<string, StandardSchema>;
  readonly client?: Record<string, StandardSchema>;
}

interface Loaded {
  readonly schema: EnvSchema;
  /** Every validated value, server and client. */
  readonly all: Record<string, unknown>;
  readonly client: Record<string, unknown>;
  readonly dependencies: string[];
}

function isStandardSchema(value: unknown): value is StandardSchema {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StandardSchema)["~standard"]?.validate === "function"
  );
}

/**
 * Keys this plugin copied into `process.env` from the `.env` files.
 *
 * Process-wide, because Vite restarts the dev server on a `.env` edit and that
 * makes new plugin instances in the same process. A key copied by the last
 * instance would otherwise count as set by the real environment, which wins,
 * and the edit would never be seen.
 */
const FOLDED = Symbol.for("@barqjs/vite:env-folded");

function folded(): Set<string> {
  const holder = globalThis as { [FOLDED]?: Set<string> };
  return (holder[FOLDED] ??= new Set());
}

function foldIntoProcess(mode: string, envDir: string | false): Record<string, string> {
  const keys = folded();
  for (const key of keys) delete process.env[key];
  keys.clear();
  const fromFiles = envDir === false ? {} : loadEnv(mode, envDir, "");
  for (const [key, value] of Object.entries(fromFiles)) {
    if (key in process.env) continue;
    process.env[key] = value;
    keys.add(key);
  }
  const raw: Record<string, string> = { ...fromFiles };
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") raw[key] = value;
  }
  return raw;
}

function checkShape(exported: unknown, file: string, prefixes: readonly string[]): EnvSchema {
  if (typeof exported !== "object" || exported === null) {
    throw new Error(
      `[barq] \`${file}\` must default-export \`{ server?, client? }\`, each a map of variable names to Standard Schema validators (zod, valibot, arktype).`,
    );
  }
  const schema = exported as Record<string, unknown>;
  for (const key of Object.keys(schema)) {
    if (key !== "server" && key !== "client") {
      throw new Error(
        `[barq] \`${file}\` has a \`${key}\` key; the schema takes only \`server\` and \`client\`.`,
      );
    }
  }
  for (const side of ["server", "client"] as const) {
    const shape = schema[side];
    if (shape === undefined) continue;
    if (typeof shape !== "object" || shape === null) {
      throw new Error(`[barq] \`${side}\` in \`${file}\` must map variable names to validators.`);
    }
    for (const [key, validator] of Object.entries(shape)) {
      if (!isStandardSchema(validator)) {
        throw new Error(
          `[barq] \`${side}.${key}\` in \`${file}\` is not a Standard Schema validator: it has no \`~standard.validate\`.`,
        );
      }
    }
  }
  const typed = schema as EnvSchema;
  for (const key of Object.keys(typed.client ?? {})) {
    if (!prefixes.some((prefix) => key.startsWith(prefix))) {
      throw new Error(
        `[barq] The client variable \`${key}\` in \`${file}\` has no public prefix (${prefixes.join(", ")}). ` +
          "Client values are written into the browser bundle: rename it, or move it to `server` if it is a secret.",
      );
    }
    if (typed.server !== undefined && key in typed.server) {
      throw new Error(
        `[barq] \`${key}\` is declared under both \`server\` and \`client\` in \`${file}\`.`,
      );
    }
  }
  // Vite writes every prefixed variable into `import.meta.env` for the
  // browser, whichever side declares it, so a prefixed server variable is not
  // a secret however it is declared.
  for (const key of Object.keys(typed.server ?? {})) {
    const prefix = prefixes.find((one) => key.startsWith(one));
    if (prefix !== undefined) {
      throw new Error(
        `[barq] The server variable \`${key}\` in \`${file}\` carries the public prefix \`${prefix}\`, so Vite sends it to the browser through \`import.meta.env\`. ` +
          "Rename it without the prefix, or move it to `client` if it is public.",
      );
    }
  }
  return typed;
}

function writeTypes(schema: EnvSchema, schemaFile: string): void {
  const target = join(dirname(schemaFile), ENV_TYPES_FILE);
  const specifier = `./${basename(schemaFile).replace(/\.[cm]?[jt]s$/, "")}`;
  const field = (side: "server" | "client", key: string): string =>
    `    readonly ${JSON.stringify(key)}: Output<Schema[${JSON.stringify(side)}][${JSON.stringify(key)}]>;`;
  const block = (id: string, fields: string[]): string =>
    [
      `declare module "${id}" {`,
      `  type Schema = (typeof import(${JSON.stringify(specifier)}))["default"];`,
      `  type Output<T> = T extends { "~standard": { types?: { output: infer O } } } ? O : string;`,
      `  const env: {`,
      ...fields,
      `  };`,
      `  export { env };`,
      `  export default env;`,
      `}`,
    ].join("\n");
  const client = Object.keys(schema.client ?? {}).map((key) => field("client", key));
  const server = [
    ...Object.keys(schema.server ?? {}).map((key) => field("server", key)),
    ...client,
  ];
  const source =
    `// Generated by @barqjs/vite from ${basename(schemaFile)}. Do not edit.\n\n` +
    `${block(CLIENT_ENV_ID, client)}\n\n${block(SERVER_ENV_ID, server)}\n`;
  try {
    if (existsSync(target) && readFileSync(target, "utf8") === source) return;
    writeFileSync(target, source);
  } catch {
    // A read-only checkout still builds; the modules are untyped there.
  }
}

/**
 * Typed environment variables, Solid's `start.env`.
 *
 * `env.ts` default-exports `server` and `client` maps of Standard Schema
 * validators. `virtual:env/client` is the client values, validated at build
 * time and written in as JSON, which is what the public prefix means.
 * `virtual:env/server` is NOT written in: it reads `process.env` when the
 * server starts and validates there, so a secret exists in no build output and
 * a platform's own variables work. Validation there is synchronous, because a
 * top-level await in a server chunk forces every downstream target to esnext.
 */
export function startEnv(option: boolean | string | undefined): Plugin[] {
  if (option === false) return [];
  let root = process.cwd();
  let config: ResolvedConfig | null = null;
  let building = false;
  let schemaFile: string | null = null;
  let shown = "env.ts";
  let pending: Promise<Loaded> | null = null;
  let reported = false;

  const locate = (): void => {
    if (typeof option === "string") {
      const file = isAbsolute(option) ? option : resolve(root, option);
      if (!existsSync(file))
        throw new Error(`[barq] \`start.env\` names \`${option}\`, which does not exist.`);
      schemaFile = file;
      shown = relative(root, file).replaceAll("\\", "/");
      return;
    }
    for (const candidate of SCHEMA_FILES) {
      const file = join(root, candidate);
      if (existsSync(file)) {
        schemaFile = file;
        shown = candidate;
        return;
      }
    }
    if (option === true) {
      throw new Error(
        `[barq] \`start.env\` is on and there is no ${SCHEMA_FILES.join(" or ")} at the project root. ` +
          "Add one that default-exports `{ server, client }`, or point `start.env` at the file.",
      );
    }
  };

  const prefixes = (): string[] => {
    const prefix = config?.envPrefix ?? "VITE_";
    return Array.isArray(prefix) ? prefix : [prefix];
  };

  const validate = async (): Promise<Loaded> => {
    const resolved = config as ResolvedConfig;
    const file = schemaFile as string;
    let exported: unknown;
    let dependencies: string[];
    try {
      const imported = await runnerImport<{ default?: unknown }>(file, {
        root,
        mode: resolved.mode,
        configFile: false,
        logLevel: "silent",
      });
      exported = imported.module.default;
      dependencies = imported.dependencies.map((dependency) => resolve(root, dependency));
    } catch (error) {
      throw new Error(`[barq] \`${shown}\` could not be loaded: ${(error as Error).message}`, {
        cause: error,
      });
    }
    const schema = checkShape(exported, shown, prefixes());
    // The types follow the schema alone, so a missing variable does not also
    // take the editor's types away.
    writeTypes(schema, file);

    const envDir = resolved.envDir === false ? false : (resolved.envDir ?? root);
    const raw = foldIntoProcess(resolved.mode, envDir);
    const issues: { key: string; message: string; side: "server" | "client" }[] = [];
    const all: Record<string, unknown> = {};
    for (const side of ["server", "client"] as const) {
      for (const [key, validator] of Object.entries(schema[side] ?? {})) {
        let result = validator["~standard"].validate(raw[key]);
        if (result instanceof Promise) {
          if (side === "server") {
            throw new Error(
              `[barq] The server variable \`${key}\` in \`${shown}\` has an asynchronous validator. ` +
                "Server values are validated when the server starts, synchronously, so make it synchronous.",
            );
          }
          result = await result;
        }
        if (result.issues !== undefined && result.issues.length > 0) {
          for (const issue of result.issues) {
            const path = (issue.path ?? [])
              .map((segment) =>
                typeof segment === "object" && segment !== null && "key" in segment
                  ? String(segment.key)
                  : String(segment),
              )
              .join(".");
            issues.push({
              key: path === "" ? key : `${key}.${path}`,
              message: issue.message,
              side,
            });
          }
        } else {
          all[key] = result.value;
        }
      }
    }
    if (issues.length > 0) {
      const report = (list: typeof issues): string =>
        `[barq] The environment does not match \`${shown}\` (mode ${resolved.mode}):\n` +
        list.map(({ key, message }) => `  ${key}: ${message}`).join("\n");
      const clientIssues = issues.filter((issue) => issue.side === "client");
      // A build may run without the production secrets, which the server
      // checks again when it starts. Client values are written in now.
      if (!building || clientIssues.length > 0) {
        throw new Error(report(building ? clientIssues : issues));
      }
      resolved.logger.warn(`${report(issues)}\nThe server checks these again when it starts.`);
    }
    const client: Record<string, unknown> = {};
    for (const key of Object.keys(schema.client ?? {})) client[key] = all[key];
    return { schema, all, client, dependencies };
  };

  const loaded = (): Promise<Loaded> => (pending ??= validate());

  const serverOnly = (importer?: string): string =>
    `[barq] \`${SERVER_ENV_ID}\` is imported by the browser bundle${importer === undefined ? "" : ` (from \`${importer}\`)`}. ` +
    `Server values never reach the browser: import \`${CLIENT_ENV_ID}\` for the public ones, or move this import to server code.`;

  const serverModule = (values: Loaded): string => {
    const keys = Object.keys(values.schema.server ?? {});
    const lines = [`const values = ${JSON.stringify(values.client)};`];
    if (keys.length > 0) {
      lines.unshift(`import schema from ${JSON.stringify(schemaFile)};`);
      lines.push(
        `const issues = [];`,
        `for (const key of ${JSON.stringify(keys)}) {`,
        `  const result = schema.server[key]["~standard"].validate(process.env[key]);`,
        `  if (result && typeof result.then === "function") issues.push("  " + key + ": its validator is asynchronous");`,
        `  else if (result.issues && result.issues.length) for (const issue of result.issues) issues.push("  " + key + ": " + issue.message);`,
        `  else values[key] = result.value;`,
        `}`,
        `if (issues.length) throw new Error(${JSON.stringify(`[barq] The server environment does not match \`${shown}\`:\n`)} + issues.join("\\n"));`,
      );
    }
    lines.push(`export const env = Object.freeze(values);`, `export default env;`, ``);
    return lines.join("\n");
  };

  return [
    {
      name: "barq:env",
      sharedDuringBuild: true,
      config(user) {
        root = resolve(user.root ?? process.cwd());
        locate();
      },
      configResolved(resolved) {
        config = resolved;
        root = resolved.root;
        building = resolved.command === "build";
        // Before any server module runs, since the copy into `process.env`
        // is part of it.
        if (schemaFile !== null) loaded().catch(() => undefined);
      },
      async buildStart() {
        if (schemaFile === null) return;
        try {
          await loaded();
        } catch (error) {
          if (building) throw error;
          if (!reported) {
            reported = true;
            config?.logger.error((error as Error).message);
          }
        }
      },
      resolveId(id, importer, options) {
        if (schemaFile === null) return null;
        if (id === CLIENT_ENV_ID) return RESOLVED_CLIENT_ENV_ID;
        if (id !== SERVER_ENV_ID) return null;
        const scan = (options as { scan?: boolean } | undefined)?.scan === true;
        if (!scan && consumerOf(this.environment, options) === "client") {
          this.error(serverOnly(importer));
        }
        return RESOLVED_SERVER_ENV_ID;
      },
      async load(id, options) {
        if (id !== RESOLVED_CLIENT_ENV_ID && id !== RESOLVED_SERVER_ENV_ID) return null;
        const values = await loaded();
        if (id === RESOLVED_CLIENT_ENV_ID) {
          return `export const env = Object.freeze(${JSON.stringify(values.client)});\nexport default env;\n`;
        }
        if (consumerOf(this.environment, options) === "client") this.error(serverOnly());
        return serverModule(values);
      },
      configureServer(server) {
        if (schemaFile === null || config === null) return;
        const resolved = config;
        const envDir = resolved.envDir === false ? null : (resolved.envDir ?? root);
        const watched = new Set<string>([schemaFile]);
        if (envDir !== null) {
          for (const name of [
            ".env",
            ".env.local",
            `.env.${resolved.mode}`,
            `.env.${resolved.mode}.local`,
          ]) {
            watched.add(join(envDir, name));
          }
        }
        server.watcher.add([...watched]);
        loaded()
          .then(({ dependencies }) => {
            for (const dependency of dependencies) watched.add(dependency);
            server.watcher.add(dependencies);
          })
          .catch(() => undefined);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const changed = (file: string): void => {
          if (!watched.has(file)) return;
          clearTimeout(timer);
          timer = setTimeout(() => {
            pending = null;
            loaded()
              .then(() => resolved.logger.info(`[barq] ${shown} revalidated`))
              .catch((error: unknown) => resolved.logger.error((error as Error).message))
              .finally(() => {
                for (const environment of Object.values(server.environments)) {
                  for (const id of [RESOLVED_CLIENT_ENV_ID, RESOLVED_SERVER_ENV_ID]) {
                    const module = environment.moduleGraph.getModuleById(id);
                    if (module !== undefined) environment.moduleGraph.invalidateModule(module);
                  }
                }
                server.environments.client?.hot.send({ type: "full-reload" });
              });
          }, 100);
        };
        server.watcher.on("change", changed);
        server.watcher.on("add", changed);
        server.watcher.on("unlink", changed);
      },
      /**
       * A server value written into a browser chunk, found by its text.
       *
       * Something inlined it: a `define`, a copied literal, the schema module
       * imported from shared code. Values under eight characters are skipped,
       * as are values a client variable also holds, because both match by
       * accident.
       */
      async generateBundle(_options, bundle) {
        if (schemaFile === null || !building || consumerOf(this.environment) !== "client") return;
        const values = await loaded().catch(() => null);
        if (values === null) return;
        const public_ = new Set(Object.values(values.client));
        const secrets = Object.entries(values.all).filter(
          (entry): entry is [string, string] =>
            !(entry[0] in values.client) &&
            typeof entry[1] === "string" &&
            entry[1].length >= 8 &&
            !public_.has(entry[1]),
        );
        const leaks: string[] = [];
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type !== "chunk") continue;
          for (const [key, value] of secrets) {
            const quoted = new RegExp(`(["'\`])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`);
            if (quoted.test(chunk.code)) leaks.push(`  ${key} in ${fileName}`);
          }
        }
        if (leaks.length > 0) {
          this.error(
            `[barq] Server environment values are in the browser bundle:\n${leaks.join("\n")}\n` +
              `Read them from \`${SERVER_ENV_ID}\` in server code, and look for a copied value or an import of \`${shown}\` from shared code.`,
          );
        }
      },
    },
  ];
}
