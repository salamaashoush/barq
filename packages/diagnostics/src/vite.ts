/**
 * The dev server's half: an endpoint an agent can `curl`, and the injected
 * module that connects the page's bridge to it.
 *
 * `GET` answers with the artifacts stored so far, `POST` either stores an
 * artifact a page captured or forwards a method call (`begin`, `end`,
 * `whyDidRun`, ...) to the connected page, and `DELETE` clears the store. An
 * `end` stores what the page captured, so the next `GET` serves it.
 */
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { Plugin } from "vite";

import { ARTIFACT_FORMAT_VERSION, artifactFromPayload, artifactToJSONL } from "./artifact.ts";
import {
  DIAGNOSTICS_ENDPOINT,
  DIAGNOSTICS_METHODS,
  DIAGNOSTICS_REQUEST_EVENT,
  DIAGNOSTICS_RESPONSE_EVENT,
} from "./protocol.ts";
import type {
  DiagnosticsEndpointState,
  DiagnosticsMethod,
  DiagnosticsRequest,
  DiagnosticsResponse,
} from "./protocol.ts";
import type { BridgePayload, DiagnosticsArtifact } from "./types.ts";

const PACKAGE = "@barqjs/diagnostics";
const BRIDGE_ID = "virtual:barq-diagnostics-bridge";
const RESOLVED_BRIDGE_ID = `\0${BRIDGE_ID}`;
const MAX_BODY_BYTES = 32 * 1024 * 1024;

export interface DiagnosticsEndpointOptions {
  /** How many artifacts the endpoint keeps; the oldest is dropped first (default 20). */
  keep?: number;
  /** How long a method call waits for a page to answer, in ms (default 10000). */
  timeout?: number;
}

export interface DiagnosticsPluginOptions extends DiagnosticsEndpointOptions {
  /**
   * Inject the bridge into `index.html` (default `true`). An app with no
   * `index.html` connects it from its own client entry, see
   * `connectDiagnosticsBridge`.
   */
  inject?: boolean;
}

export interface ConnectedClients {
  readonly size: number;
}

/** The dev server's side of the custom-event round trip. */
export interface PageChannel {
  send(event: string, request: DiagnosticsRequest): void;
  on(event: string, listener: (response: DiagnosticsResponse) => void): void;
  readonly clients: ConnectedClients;
}

export interface EndpointRequest {
  method?: string;
  url?: string;
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
}

export interface EndpointResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

export type DiagnosticsEndpoint = (
  req: EndpointRequest,
  res: EndpointResponse,
  next: () => void,
) => Promise<void>;

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sendJson(res: EndpointResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJson(req: EndpointRequest): Promise<unknown> {
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for await (const chunk of req) {
    const part =
      typeof chunk === "string" ? chunk : decoder.decode(chunk as Uint8Array, { stream: true });
    bytes += part.length;
    if (bytes > MAX_BODY_BYTES) throw new HttpError(413, "Request body is too large.");
    text += part;
  }
  text += decoder.decode();
  if (text === "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "Request body is not valid JSON.");
  }
}

function isArtifact(body: object): body is DiagnosticsArtifact {
  const candidate = body as Partial<DiagnosticsArtifact>;
  return (
    typeof candidate.capturedAt === "string" &&
    Array.isArray(candidate.diagnostics) &&
    (candidate.attribution === null || typeof candidate.attribution === "object")
  );
}

const USAGE =
  `POST either an artifact ({ "formatVersion": ${ARTIFACT_FORMAT_VERSION}, ... }) or a method call ` +
  `({ "method": ${DIAGNOSTICS_METHODS.map((method) => `"${method}"`).join(" | ")}, "params"?: ... }).`;

interface UncheckedRequestBody {
  method?: unknown;
  params?: unknown;
}

/**
 * The endpoint as a connect-style handler. `channel` reaches the page; with
 * `null` the store still works and a method call answers 503.
 */
export function createDiagnosticsEndpoint(
  channel: PageChannel | null,
  options: DiagnosticsEndpointOptions = {},
): DiagnosticsEndpoint {
  const keep = options.keep ?? 20;
  const timeout = options.timeout ?? 10_000;
  const artifacts: DiagnosticsArtifact[] = [];
  const pending = new Map<number, (response: DiagnosticsResponse) => void>();
  let nextId = 1;

  channel?.on(DIAGNOSTICS_RESPONSE_EVENT, (response) => {
    pending.get(response?.id)?.(response);
  });

  function store(artifact: DiagnosticsArtifact): void {
    artifacts.push(artifact);
    if (artifacts.length > keep) artifacts.splice(0, artifacts.length - keep);
  }

  function call(
    live: PageChannel,
    method: DiagnosticsMethod,
    params: unknown,
  ): Promise<DiagnosticsResponse> {
    const id = nextId++;
    return new Promise((settle, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new HttpError(
            504,
            `No page answered within ${timeout}ms. The open page may predate the plugin: reload it.`,
          ),
        );
      }, timeout);
      // With several tabs open the first to answer wins.
      pending.set(id, (response) => {
        pending.delete(id);
        clearTimeout(timer);
        settle(response);
      });
      live.send(DIAGNOSTICS_REQUEST_EVENT, { id, method, params } as DiagnosticsRequest);
    });
  }

  async function post(req: EndpointRequest, res: EndpointResponse): Promise<void> {
    const body = await readJson(req);
    if (typeof body !== "object" || body === null) throw new HttpError(400, USAGE);

    if ("formatVersion" in body) {
      if (body.formatVersion !== ARTIFACT_FORMAT_VERSION) {
        throw new HttpError(
          400,
          `Unsupported artifact formatVersion ${JSON.stringify(body.formatVersion)}; this endpoint stores version ${ARTIFACT_FORMAT_VERSION}.`,
        );
      }
      if (!isArtifact(body)) {
        throw new HttpError(
          400,
          "The artifact needs `capturedAt`, a `diagnostics` array and `attribution` (an object or null).",
        );
      }
      store(body);
      sendJson(res, 201, { stored: artifacts.length });
      return;
    }

    const method = (body as UncheckedRequestBody).method;
    if (typeof method !== "string" || !DIAGNOSTICS_METHODS.includes(method as DiagnosticsMethod)) {
      throw new HttpError(400, USAGE);
    }
    if (channel === null || channel.clients.size === 0) {
      throw new HttpError(
        503,
        "No connected page. Open the app in a browser against this dev server so the diagnostics bridge can answer.",
      );
    }
    const response = await call(
      channel,
      method as DiagnosticsMethod,
      (body as UncheckedRequestBody).params,
    );
    if (response.error !== undefined) throw new HttpError(400, response.error);
    if (method === "end") {
      const artifact = artifactFromPayload(response.result as BridgePayload);
      store(artifact);
      sendJson(res, 200, { result: artifact });
      return;
    }
    sendJson(res, 200, { result: response.result });
  }

  return async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== DIAGNOSTICS_ENDPOINT) {
      next();
      return;
    }
    try {
      switch (req.method) {
        case "GET": {
          if (url.searchParams.get("format") === "jsonl") {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/x-ndjson");
            res.end(artifacts.map(artifactToJSONL).join(""));
            return;
          }
          const state: DiagnosticsEndpointState = {
            artifacts,
            clients: channel?.clients.size ?? 0,
            methods: DIAGNOSTICS_METHODS,
          };
          sendJson(res, 200, state);
          return;
        }
        case "POST":
          await post(req, res);
          return;
        case "DELETE": {
          const cleared = artifacts.length;
          artifacts.length = 0;
          sendJson(res, 200, { cleared });
          return;
        }
        default:
          res.setHeader("Allow", "GET, POST, DELETE");
          throw new HttpError(
            405,
            `Use GET for the stored artifacts, DELETE to clear them. ${USAGE}`,
          );
      }
    } catch (error) {
      sendJson(res, error instanceof HttpError ? error.status : 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

/**
 * Whether Vite's optimizer pre-bundles this package for the app at `root`: it
 * does for a copy under `node_modules` and leaves a linked workspace alone.
 * Naming a linked one in `optimizeDeps.include` would give the page a second
 * copy of the engine beside the one the app's source imports.
 */
function prebundled(root: string): boolean {
  for (let at = root; ; at = dirname(at)) {
    const candidate = join(at, "node_modules", PACKAGE);
    if (existsSync(join(candidate, "package.json"))) {
      return realpathSync(candidate).split(/[\\/]/).includes("node_modules");
    }
    if (dirname(at) === at) return false;
  }
}

const BRIDGE_MODULE = [
  `import { connectDiagnosticsBridge, installDiagnosticsBridge } from "${PACKAGE}/browser";`,
  "const bridge = installDiagnosticsBridge();",
  "if (import.meta.hot) connectDiagnosticsBridge(bridge, import.meta.hot);",
].join("\n");

/**
 * Serves `/__barq/diagnostics` from the dev server and connects the page's
 * bridge to it. Development server only.
 */
export function barqDiagnostics(options: DiagnosticsPluginOptions = {}): Plugin {
  const inject = options.inject !== false;
  let root = process.cwd();

  return {
    name: "barq:diagnostics-endpoint",
    apply: "serve",

    config(user) {
      // Found only when the page first loads, the bridge's imports would
      // re-optimize and reload it.
      if (!inject || !prebundled(resolve(user.root ?? process.cwd()))) return undefined;
      return { optimizeDeps: { include: [`${PACKAGE}/browser`] } };
    },

    configResolved(config) {
      root = config.root;
    },

    async resolveId(source, importer) {
      if (source === BRIDGE_ID) return RESOLVED_BRIDGE_ID;
      // The virtual module has no directory to resolve a bare import from.
      if (importer === RESOLVED_BRIDGE_ID && source.startsWith(PACKAGE)) {
        const resolved = await this.resolve(source, join(root, "index.html"), { skipSelf: true });
        if (resolved === null) {
          this.error(
            `${PACKAGE} is not installed in the app at ${root}. Add it as a development dependency: its /browser entry is the bridge the page loads.`,
          );
        }
        return resolved;
      }
      return null;
    },

    load(id) {
      return id === RESOLVED_BRIDGE_ID ? BRIDGE_MODULE : null;
    },

    transformIndexHtml() {
      if (!inject) return undefined;
      return [
        {
          tag: "script",
          attrs: { type: "module", src: `/@id/${BRIDGE_ID}` },
          injectTo: "head",
        },
      ];
    },

    configureServer(server) {
      const endpoint = createDiagnosticsEndpoint(
        {
          send: (event, request) => server.ws.send(event, request),
          on: (event, listener) => server.ws.on(event, listener),
          // Vite answers `clients` with a new set on every read, so one taken
          // here would stay the size it was before any page connected.
          get clients() {
            return server.ws.clients;
          },
        },
        options,
      );
      server.middlewares.use((req, res, next) => {
        void endpoint(req, res, next);
      });

      const printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        printUrls();
        const local = server.resolvedUrls?.local[0];
        const url =
          local === undefined ? DIAGNOSTICS_ENDPOINT : new URL(DIAGNOSTICS_ENDPOINT, local).href;
        server.config.logger.info(
          `  ➜  barq diagnostics: ${url} (GET artifacts, POST {"method":"begin"|"end"|"whyDidRun"|"costs"}, DELETE)\n` +
            `  ➜  Agent skill: node_modules/${PACKAGE}/skills/agent-loops/SKILL.md`,
        );
      };
    },
  };
}
