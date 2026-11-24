import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import {
  OBSERVE,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
} from "@barqjs/core";

import {
  BRIDGE_GLOBAL,
  answerDiagnosticsRequest,
  connectDiagnosticsBridge,
  installDiagnosticsBridge,
  publishArtifact,
} from "./browser.ts";
import type { DiagnosticsBridge } from "./browser.ts";
import { artifactToJSONL, assertBudget, expectDiagnostic, expectNoDiagnostics } from "./index.ts";
import type { DiagnosticsArtifact } from "./index.ts";
import { captureBrowserArtifact } from "./playwright.ts";
import type { EvaluatingPage } from "./playwright.ts";
import {
  DIAGNOSTICS_ENDPOINT,
  DIAGNOSTICS_REQUEST_EVENT,
  DIAGNOSTICS_RESPONSE_EVENT,
} from "./protocol.ts";
import type { DiagnosticsRequest, DiagnosticsResponse } from "./protocol.ts";
import { recorder, request } from "./test-endpoint.ts";
import { createDiagnosticsEndpoint } from "./vite.ts";
import type { DiagnosticsEndpoint, PageChannel } from "./vite.ts";

const development = OBSERVE !== undefined;
const attribution = { hotTime: false } as const;

function overWire<V>(value: V): V {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as V);
}

/**
 * A page in this process: `evaluate` runs in the realm the bridge was
 * installed on and puts arguments and results through JSON, as a real page
 * boundary does, so anything that cannot cross fails here.
 */
function fakePage(realm: Record<string, unknown>): EvaluatingPage {
  const globals: Record<string, unknown> = globalThis;
  return {
    async evaluate(pageFunction: (arg?: unknown) => unknown, arg?: unknown) {
      const previous = globals[BRIDGE_GLOBAL];
      globals[BRIDGE_GLOBAL] = realm[BRIDGE_GLOBAL];
      try {
        return overWire(await pageFunction(overWire(arg)));
      } finally {
        globals[BRIDGE_GLOBAL] = previous;
      }
    },
  };
}

/** The dev server's channel to a page whose `import.meta.hot` is connected to `bridge`. */
function connectedPage(bridge: DiagnosticsBridge): PageChannel {
  const toPage: ((request: DiagnosticsRequest) => void)[] = [];
  const toServer: ((response: DiagnosticsResponse) => void)[] = [];
  connectDiagnosticsBridge(bridge, {
    on(event, listener) {
      if (event === DIAGNOSTICS_REQUEST_EVENT) toPage.push(listener);
    },
    send(event, response) {
      if (event === DIAGNOSTICS_RESPONSE_EVENT) {
        for (const listener of toServer) listener(overWire(response));
      }
    },
  });
  return {
    clients: { size: 1 },
    on: (_event, listener) => void toServer.push(listener),
    send(_event, asked) {
      for (const listener of toPage) listener(overWire(asked));
    },
  };
}

async function curl(endpoint: DiagnosticsEndpoint, method: string, body?: unknown, query = "") {
  const res = recorder();
  await endpoint(
    request(
      method,
      DIAGNOSTICS_ENDPOINT + query,
      body === undefined ? undefined : JSON.stringify(body),
    ),
    res,
    () => {},
  );
  return res;
}

function counterApp() {
  const [count, setCount] = createSignal(0, { name: "count" });
  const painted: number[] = [];
  const dispose = createRoot((close) => {
    const double = createMemo(() => count() * 2, { name: "double" });
    createRenderEffect(double, (value) => void painted.push(value), { name: "paint" });
    return close;
  });
  flush();
  return {
    painted,
    dispose,
    click() {
      setCount((value) => value + 1);
      flush();
    },
    orphan() {
      // An effect outside any root can never be disposed: NO_OWNER_EFFECT.
      createRenderEffect(
        () => 1,
        () => {},
      );
    },
  };
}

interface RestorableSpy {
  mockRestore(): void;
}

describe.if(development)("the browser bridge", () => {
  let consoles: RestorableSpy[] = [];
  beforeAll(() => {
    consoles = (["log", "info", "warn", "error"] as const).map((method) =>
      spyOn(console, method).mockImplementation(() => {}),
    );
  });
  afterAll(() => {
    for (const spy of consoles) spy.mockRestore();
  });

  test("installs on the global it is given", () => {
    const realm: Record<string, unknown> = {};
    const bridge = installDiagnosticsBridge(realm);
    expect(BRIDGE_GLOBAL).toBe("__BARQ_DIAGNOSTICS__");
    expect(realm.__BARQ_DIAGNOSTICS__).toBe(bridge);
    expect(bridge.active()).toBe(false);
  });

  test("captures a scripted interaction across the page boundary", async () => {
    const realm: Record<string, unknown> = {};
    installDiagnosticsBridge(realm);
    const app = counterApp();

    const { result, artifact } = await captureBrowserArtifact(
      fakePage(realm),
      () => {
        app.click();
        app.click();
        return app.painted.at(-1);
      },
      { scenario: "two clicks", attribution },
    );
    app.dispose();

    expect(result).toBe(4);
    expect(artifact.formatVersion).toBe(1);
    expect(artifact.scenario).toBe("two clicks");
    expect(artifact.timeOrigin).toBe(performance.timeOrigin);
    expectNoDiagnostics(artifact);
    // The mount happened before the capture, so only the clicks are counted.
    assertBudget(artifact, { maxWastedRuns: 0, scopes: { double: 2, paint: 2 } });
    expect(artifact.attribution!.costs.writes.map((write) => write.name)).toEqual(["count"]);
    expect(artifactToJSONL(artifact).split("\n")[0]).toContain('"rerunCount":4');
  });

  test("carries findings across, and nothing with attribution off", async () => {
    const realm: Record<string, unknown> = {};
    installDiagnosticsBridge(realm);
    const app = counterApp();
    const { artifact } = await captureBrowserArtifact(fakePage(realm), () => app.orphan(), {
      attribution: false,
    });
    app.dispose();

    expect(artifact.attribution).toBeNull();
    expectDiagnostic(artifact, "NO_OWNER_EFFECT");
    expect(artifact.diagnostics[0].docs).toBe(
      "https://docs.solidjs.com/reference/solid-js/diagnostics/no-owner-effect",
    );
  });

  test("says how to install the bridge when the page has none", async () => {
    await expect(captureBrowserArtifact(fakePage({}), () => {})).rejects.toThrow(
      "@barqjs/diagnostics bridge not found in the page.",
    );
  });

  test("refuses overlapping sessions and closes the session of a failed interaction", async () => {
    const realm: Record<string, unknown> = {};
    const bridge = installDiagnosticsBridge(realm);
    const page = fakePage(realm);

    await expect(
      captureBrowserArtifact(page, () => {
        expect(() => bridge.begin()).toThrow("capture already active; call end() first.");
        throw new Error("interaction failed");
      }),
    ).rejects.toThrow("interaction failed");
    expect(bridge.active()).toBe(false);
    expect(() => bridge.end()).toThrow("capture not active; call begin() first.");

    const { artifact } = await captureBrowserArtifact(page, () => {});
    expect(artifact.diagnostics).toEqual([]);
  });

  test("answers live queries against the open session", () => {
    const bridge = installDiagnosticsBridge({});
    expect(() => bridge.whyDidRun("double")).toThrow("whyDidRun() needs an open session");

    const app = counterApp();
    bridge.begin({ attribution });
    app.click();
    expect(bridge.whyDidRun("double").map((rerun) => rerun.causes[0].name)).toEqual(["count"]);
    expect(bridge.whyDidRun("missing")).toEqual([]);
    expect(
      bridge
        .costs()
        .scopes.map((scope) => scope.name)
        .toSorted(),
    ).toEqual(["double", "paint"]);
    expect(bridge.holds()).toEqual([]);
    expect(bridge.feedback().sources).toEqual([]);
    bridge.end();

    bridge.begin({ attribution: false });
    expect(() => bridge.costs()).toThrow(
      "costs() needs attribution; the open session was begun with it off.",
    );
    bridge.end();
    app.dispose();
  });

  test("answers protocol requests, turning a throw into the response's error", () => {
    const bridge = installDiagnosticsBridge({});
    expect(answerDiagnosticsRequest(bridge, { id: 1, method: "active" })).toEqual({
      id: 1,
      result: false,
    });
    expect(answerDiagnosticsRequest(bridge, { id: 2, method: "end" })).toEqual({
      id: 2,
      error: "Diagnostics bridge capture not active; call begin() first.",
    });
    expect(answerDiagnosticsRequest(bridge, { id: 3, method: "begin" })).toEqual({
      id: 3,
      result: true,
    });
    expect(answerDiagnosticsRequest(bridge, { id: 4, method: "whyDidRun" })).toEqual({
      id: 4,
      error: 'whyDidRun needs params { "name": string }.',
    });
    expect(
      answerDiagnosticsRequest(bridge, { id: 5, method: "reset" } as unknown as DiagnosticsRequest),
    ).toEqual({ id: 5, error: "Unknown diagnostics method: reset" });
    bridge.end();
  });
});

interface WhyDidRunReply {
  result: RerunName[];
}

interface RerunName {
  nodeName: string;
}

interface EndReply {
  result: DiagnosticsArtifact;
}

interface StoredArtifacts {
  artifacts: DiagnosticsArtifact[];
}

describe.if(development)("the bridge behind the dev-server endpoint", () => {
  test("an agent drives a capture with begin and end, then reads it back", async () => {
    const bridge = installDiagnosticsBridge({});
    const endpoint = createDiagnosticsEndpoint(connectedPage(bridge));
    const app = counterApp();

    expect((await curl(endpoint, "POST", { method: "active" })).json()).toEqual({ result: false });
    const begun = await curl(endpoint, "POST", {
      method: "begin",
      params: { scenario: "agent click", attribution },
    });
    expect(begun.json()).toEqual({ result: true });
    expect(bridge.active()).toBe(true);

    app.click();

    const why = await curl(endpoint, "POST", { method: "whyDidRun", params: { name: "paint" } });
    expect((why.json() as WhyDidRunReply).result.map((rerun) => rerun.nodeName)).toEqual(["paint"]);

    const ended = await curl(endpoint, "POST", { method: "end" });
    app.dispose();
    const { result } = ended.json() as EndReply;
    expect(result.formatVersion).toBe(1);
    expect(result.scenario).toBe("agent click");
    assertBudget(result, { maxReruns: 2, scopes: { double: 1, paint: 1 } });

    const stored = (await curl(endpoint, "GET")).json() as StoredArtifacts;
    expect(stored.artifacts).toEqual([result]);
    expect((await curl(endpoint, "GET", undefined, "?format=jsonl")).body).toBe(
      artifactToJSONL(result),
    );

    const twice = await curl(endpoint, "POST", { method: "end" });
    expect(twice.statusCode).toBe(400);
    expect(twice.json()).toEqual({
      error: "Diagnostics bridge capture not active; call begin() first.",
    });
  });

  test("a page posts its own capture with publishArtifact", async () => {
    const bridge = installDiagnosticsBridge({});
    const endpoint = createDiagnosticsEndpoint(null);
    const app = counterApp();
    const posted: string[] = [];

    bridge.begin({ attribution });
    app.click();
    const published = await publishArtifact(bridge.end(), {
      scenario: "page click",
      async fetch(url, init) {
        posted.push(`${init.method} ${url} ${init.headers["Content-Type"]}`);
        const res = recorder();
        await endpoint(request(init.method, url, init.body), res, () => {});
        return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode };
      },
    });
    app.dispose();

    expect(posted).toEqual(["POST /__barq/diagnostics application/json"]);
    expect(published.scenario).toBe("page click");
    const stored = (await curl(endpoint, "GET")).json() as StoredArtifacts;
    expect(stored.artifacts).toEqual([overWire(published)]);
    assertBudget(stored.artifacts[0], { maxReruns: 2 });
  });

  test("publishArtifact rejects when the endpoint refuses", async () => {
    const bridge = installDiagnosticsBridge({});
    bridge.begin();
    await expect(
      publishArtifact(bridge.end(), {
        endpoint: "http://localhost:5173/__barq/diagnostics",
        fetch: async () => ({ ok: false, status: 404 }),
      }),
    ).rejects.toThrow(
      "Posting the artifact to http://localhost:5173/__barq/diagnostics failed with status 404.",
    );
  });
});
