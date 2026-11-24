import { describe, expect, test } from "bun:test";

import { artifactToJSONL } from "./artifact.ts";
import { artifact, finding, rerun } from "./fixtures.ts";
import { DIAGNOSTICS_ENDPOINT, DIAGNOSTICS_METHODS } from "./protocol.ts";
import type { DiagnosticsRequest, DiagnosticsResponse } from "./protocol.ts";
import { recorder, request } from "./test-endpoint.ts";
import type { Recorded } from "./test-endpoint.ts";
import { barqDiagnostics, createDiagnosticsEndpoint } from "./vite.ts";
import type { DiagnosticsEndpoint, PageChannel } from "./vite.ts";

const first = artifact({ scenario: "first", diagnostics: [finding()] });
const second = artifact({ scenario: "second", reruns: [rerun()] });

async function send(
  endpoint: DiagnosticsEndpoint,
  method: string,
  body?: unknown,
  url: string = DIAGNOSTICS_ENDPOINT,
): Promise<Recorded> {
  const res = recorder();
  await endpoint(
    request(method, url, typeof body === "string" ? body : JSON.stringify(body)),
    res,
    () => {
      throw new Error(`${method} ${url} fell through to the next middleware`);
    },
  );
  return res;
}

interface RecordedRequests {
  requests: DiagnosticsRequest[];
}

/** A page that answers every request with `answer`, or never when it returns `undefined`. */
function page(
  answer: (request: DiagnosticsRequest) => DiagnosticsResponse | undefined,
  clients = 1,
): PageChannel & RecordedRequests {
  const listeners: ((response: DiagnosticsResponse) => void)[] = [];
  const requests: DiagnosticsRequest[] = [];
  return {
    requests,
    clients: { size: clients },
    on: (_event, listener) => void listeners.push(listener),
    send(_event, asked) {
      requests.push(asked);
      const response = answer(asked);
      if (response !== undefined) for (const listener of listeners) listener(response);
    },
  };
}

interface StoredArtifactsJson {
  artifacts: unknown[];
}

interface JsonlRecord {
  type: string;
}

interface StoredScenarios {
  artifacts: StoredScenario[];
}

interface StoredScenario {
  scenario: string;
}

interface ErrorReply {
  error: string;
}

describe("the artifact store", () => {
  test("GET answers with an empty store before anything was posted", async () => {
    const res = await send(createDiagnosticsEndpoint(null), "GET");
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    expect(res.json()).toEqual({ artifacts: [], clients: 0, methods: [...DIAGNOSTICS_METHODS] });
  });

  test("POST stores an artifact and GET serves them oldest first", async () => {
    const endpoint = createDiagnosticsEndpoint(null);
    const stored = await send(endpoint, "POST", first);
    expect(stored.statusCode).toBe(201);
    expect(stored.json()).toEqual({ stored: 1 });
    expect((await send(endpoint, "POST", second)).json()).toEqual({ stored: 2 });

    const res = await send(endpoint, "GET");
    expect((res.json() as StoredArtifactsJson).artifacts).toEqual(
      JSON.parse(JSON.stringify([first, second])) as unknown[],
    );
  });

  test("GET ?format=jsonl serves the same artifacts one record per line", async () => {
    const endpoint = createDiagnosticsEndpoint(null);
    await send(endpoint, "POST", first);
    await send(endpoint, "POST", second);

    const res = await send(endpoint, "GET", undefined, `${DIAGNOSTICS_ENDPOINT}?format=jsonl`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/x-ndjson");
    expect(res.body).toBe(artifactToJSONL(first) + artifactToJSONL(second));
    const types = res.body
      .trimEnd()
      .split("\n")
      .map((line) => (JSON.parse(line) as JsonlRecord).type);
    expect(types).toEqual([
      "meta",
      "diagnostic",
      "costs",
      "feedback",
      "meta",
      "rerun",
      "costs",
      "feedback",
    ]);
  });

  test("DELETE clears the store", async () => {
    const endpoint = createDiagnosticsEndpoint(null);
    await send(endpoint, "POST", first);
    const res = await send(endpoint, "DELETE");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ cleared: 1 });
    expect((await send(endpoint, "GET")).json()).toMatchObject({ artifacts: [] });
    expect(
      (await send(endpoint, "GET", undefined, `${DIAGNOSTICS_ENDPOINT}?format=jsonl`)).body,
    ).toBe("");
  });

  test("keeps the newest `keep` artifacts", async () => {
    const endpoint = createDiagnosticsEndpoint(null, { keep: 2 });
    for (const scenario of ["a", "b", "c"]) await send(endpoint, "POST", artifact({ scenario }));
    const { artifacts } = (await send(endpoint, "GET")).json() as StoredScenarios;
    expect(artifacts.map((stored) => stored.scenario)).toEqual(["b", "c"]);
  });

  test("refuses a body that is not an artifact, saying what is wrong", async () => {
    const endpoint = createDiagnosticsEndpoint(null);
    const cases: [unknown, number, string][] = [
      ["{", 400, "Request body is not valid JSON."],
      [
        { ...first, formatVersion: 99 },
        400,
        "Unsupported artifact formatVersion 99; this endpoint stores version 1.",
      ],
      [
        { formatVersion: 1 },
        400,
        "The artifact needs `capturedAt`, a `diagnostics` array and `attribution` (an object or null).",
      ],
      [[], 400, 'POST either an artifact ({ "formatVersion": 1, ... }) or a method call'],
      [
        { method: "reset" },
        400,
        'POST either an artifact ({ "formatVersion": 1, ... }) or a method call',
      ],
    ];
    for (const [body, status, message] of cases) {
      const res = await send(endpoint, "POST", body);
      expect(res.statusCode).toBe(status);
      expect((res.json() as ErrorReply).error).toStartWith(message);
    }
    expect((await send(endpoint, "GET")).json()).toMatchObject({ artifacts: [] });
  });

  test("answers 405 to another method and leaves other paths to the next middleware", async () => {
    const endpoint = createDiagnosticsEndpoint(null);
    const res = await send(endpoint, "PUT", first);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("GET, POST, DELETE");

    for (const url of ["/", "/__barq/diagnostics/extra", "/__barq/other"]) {
      let passed = 0;
      const untouched = recorder();
      await endpoint(request("GET", url), untouched, () => void passed++);
      expect(passed).toBe(1);
      expect(untouched.statusCode).toBe(0);
    }
  });
});

describe("method calls", () => {
  test("are forwarded to the page and answered with its result", async () => {
    const channel = page((asked) => ({ id: asked.id, result: true }));
    const endpoint = createDiagnosticsEndpoint(channel);
    const res = await send(endpoint, "POST", { method: "whyDidRun", params: { name: "TodoRow" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: true });
    expect(channel.requests).toEqual([{ id: 1, method: "whyDidRun", params: { name: "TodoRow" } }]);
    expect((await send(endpoint, "GET")).json()).toMatchObject({ clients: 1, artifacts: [] });
  });

  test("`end` stores what the page captured as an artifact", async () => {
    const { formatVersion: _version, ...payload } = first;
    const endpoint = createDiagnosticsEndpoint(
      page((asked) => ({ id: asked.id, result: payload })),
    );
    const res = await send(endpoint, "POST", { method: "end" });
    expect(res.json()).toEqual({ result: JSON.parse(JSON.stringify(first)) as unknown });
    expect(((await send(endpoint, "GET")).json() as StoredArtifactsJson).artifacts).toHaveLength(1);
  });

  test("answer 400 with the page's own error", async () => {
    const endpoint = createDiagnosticsEndpoint(
      page((asked) => ({
        id: asked.id,
        error: "Diagnostics bridge capture not active; call begin() first.",
      })),
    );
    const res = await send(endpoint, "POST", { method: "end" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: "Diagnostics bridge capture not active; call begin() first.",
    });
  });

  test("answer 503 with no page connected", async () => {
    for (const channel of [null, page(() => undefined, 0)]) {
      const res = await send(createDiagnosticsEndpoint(channel), "POST", { method: "begin" });
      expect(res.statusCode).toBe(503);
      expect((res.json() as ErrorReply).error).toStartWith("No connected page.");
    }
  });

  test("answer 504 when no page replies in time, and ignore a late reply", async () => {
    let late: DiagnosticsRequest | undefined;
    const listeners: ((response: DiagnosticsResponse) => void)[] = [];
    const endpoint = createDiagnosticsEndpoint(
      {
        clients: { size: 1 },
        on: (_event, listener) => void listeners.push(listener),
        send: (_event, asked) => void (late = asked),
      },
      { timeout: 10 },
    );
    const res = await send(endpoint, "POST", { method: "active" });
    expect(res.statusCode).toBe(504);
    expect((res.json() as ErrorReply).error).toStartWith("No page answered within 10ms.");
    for (const listener of listeners) listener({ id: late!.id, result: true });
  });
});

describe("barqDiagnostics", () => {
  test("is a dev-server plugin that injects the bridge module", () => {
    const plugin = barqDiagnostics();
    expect(plugin.name).toBe("barq:diagnostics-endpoint");
    expect(plugin.apply).toBe("serve");

    const tags = (plugin.transformIndexHtml as () => unknown)();
    expect(tags).toEqual([
      {
        tag: "script",
        attrs: { type: "module", src: "/@id/virtual:barq-diagnostics-bridge" },
        injectTo: "head",
      },
    ]);
    const resolveId = plugin.resolveId as (source: string) => Promise<unknown>;
    const load = plugin.load as (id: string) => string | null;
    expect(load("\0virtual:barq-diagnostics-bridge")).toBe(
      [
        'import { connectDiagnosticsBridge, installDiagnosticsBridge } from "@barqjs/diagnostics/browser";',
        "const bridge = installDiagnosticsBridge();",
        "if (import.meta.hot) connectDiagnosticsBridge(bridge, import.meta.hot);",
      ].join("\n"),
    );
    expect(load("/src/main.tsx")).toBeNull();
    return expect(resolveId("virtual:barq-diagnostics-bridge")).resolves.toBe(
      "\0virtual:barq-diagnostics-bridge",
    );
  });

  test("injects nothing with inject off", () => {
    const plugin = barqDiagnostics({ inject: false });
    expect((plugin.transformIndexHtml as () => unknown)()).toBeUndefined();
  });

  test("mounts the endpoint on the dev server and announces it", async () => {
    const middlewares: ((req: unknown, res: unknown, next: () => void) => void)[] = [];
    const logged: string[] = [];
    const sent: unknown[][] = [];
    // As Vite does: empty while the server starts, and a new set on each read.
    const tabs: string[] = [];
    const server = {
      ws: {
        get clients(): Set<string> {
          return new Set(tabs);
        },
        on() {},
        send: (...args: unknown[]) => void sent.push(args),
      },
      middlewares: {
        use: (handler: (typeof middlewares)[number]) => void middlewares.push(handler),
      },
      resolvedUrls: { local: ["http://localhost:5173/"], network: [] },
      printUrls: () => void logged.push("urls"),
      config: { logger: { info: (line: string) => void logged.push(line) } },
    };
    const configureServer = barqDiagnostics({ timeout: 10 }).configureServer as unknown;
    (configureServer as (dev: typeof server) => void)(server);
    expect(middlewares).toHaveLength(1);
    tabs.push("tab");

    const res = recorder();
    middlewares[0](request("POST", DIAGNOSTICS_ENDPOINT, JSON.stringify(first)), res, () => {});
    await Bun.sleep(5);
    expect(res.statusCode).toBe(201);

    const state = recorder();
    middlewares[0](request("GET", DIAGNOSTICS_ENDPOINT), state, () => {});
    await Bun.sleep(5);
    expect(state.json()).toMatchObject({ clients: 1, artifacts: [{ scenario: "first" }] });

    const call = recorder();
    middlewares[0](request("POST", DIAGNOSTICS_ENDPOINT, '{"method":"begin"}'), call, () => {});
    await Bun.sleep(30);
    expect(sent).toEqual([
      ["barq:diagnostics:request", { id: 1, method: "begin", params: undefined }],
    ]);
    expect(call.statusCode).toBe(504);

    server.printUrls();
    expect(logged[0]).toBe("urls");
    expect(logged[1]).toContain("barq diagnostics: http://localhost:5173/__barq/diagnostics");
    expect(logged[1]).toContain("node_modules/@barqjs/diagnostics/skills/agent-loops/SKILL.md");
  });
});
