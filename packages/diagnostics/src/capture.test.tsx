import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import {
  OBSERVE,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  isPending,
  type JSXElement,
} from "@barqjs/core";
import { render } from "@barqjs/testing";

import {
  ARTIFACT_FORMAT_VERSION,
  artifactToJSONL,
  assertBudget,
  captureArtifact,
  expectDiagnostic,
  expectHoldBudget,
  expectNoDiagnostics,
  expectNoSilentHolds,
  expectNoWaste,
  expectRerunBudget,
  serializeArtifact,
} from "./index.ts";
import type { DiagnosticsArtifact } from "./index.ts";
import { messageOf } from "./fixtures.ts";

const development = OBSERVE !== undefined;

// Wall-clock findings depend on host load; these tests assert structure.
const attribution = { hotTime: false } as const;

// Called from a component body. Going through a parameter keeps the compiler's
// own static check quiet, so the finding under test is the engine's.
function writeNow(set: (value: number) => unknown): void {
  set(1);
}

function WritesWhileRendering() {
  const [count, setCount] = createSignal(0, { name: "count" });
  writeNow(setCount);
  return <p>{count()}</p>;
}

// `bind:` takes a signal pair and the types say so. The finding is for the code
// that got past them, which is what this stands in for.
function untyped(value: unknown): never {
  return value as never;
}

function NameField() {
  const [name] = createSignal("salama");
  const upper = createMemo(() => name().toUpperCase());
  return <input type="text" bind:value={untyped(upper)} />;
}

function Counter() {
  const [count, setCount] = createSignal(0, { name: "count" });
  const double = createMemo(() => count() * 2, { name: "double" });
  const whole = createMemo(() => Number.isInteger(count()), { name: "whole" });
  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      {double()}:{String(whole())}
    </button>
  );
}

interface ShellProps {
  children?: JSXElement;
}

function Shell(props: ShellProps) {
  return <section>{props.children}</section>;
}

interface RestorableSpy {
  mockRestore(): void;
}

describe.if(development)("captureArtifact", () => {
  let consoles: RestorableSpy[] = [];
  beforeAll(() => {
    consoles = (["log", "info", "warn", "error"] as const).map((method) =>
      spyOn(console, method).mockImplementation(() => {}),
    );
  });
  afterAll(() => {
    for (const spy of consoles) spy.mockRestore();
  });

  test("records the engine's finding from a rendered component, with where and how to fix it", async () => {
    const { artifact } = await captureArtifact(
      () => {
        expect(() =>
          render(() => (
            <Shell>
              <WritesWhileRendering />
            </Shell>
          )),
        ).toThrow("REACTIVE_WRITE_IN_OWNED_SCOPE");
      },
      { scenario: "write while rendering", attribution },
    );

    expect(artifact.formatVersion).toBe(1);
    expect(artifact.formatVersion).toBe(ARTIFACT_FORMAT_VERSION);
    expect(artifact.scenario).toBe("write while rendering");
    expect(artifact.timeOrigin).toBe(performance.timeOrigin);
    expect(new Date(artifact.capturedAt).toISOString()).toBe(artifact.capturedAt);
    expect(artifact.durationMs).toBeGreaterThan(0);

    expectDiagnostic(artifact, "REACTIVE_WRITE_IN_OWNED_SCOPE", { count: 1 });
    const [event] = artifact.diagnostics;
    expect(event.severity).toBe("error");
    expect(event.nodeName).toBe("count");
    expect(event.ownerPath).toEqual(["<Shell>", "<WritesWhileRendering>"]);
    expect(event.loc).toMatch(/capture\.test\.tsx:\d+:\d+$/);
    expect(event.docs).toBe(
      "https://docs.solidjs.com/reference/solid-js/diagnostics/reactive-write-in-owned-scope",
    );

    const message = messageOf(() => expectNoDiagnostics(artifact));
    expect(message).toContain(
      "  REACTIVE_WRITE_IN_OWNED_SCOPE (error) in <Shell> › <WritesWhileRendering>\n" +
        `    at ${event.loc}\n`,
    );
    expect(message).toEndWith(`    docs: ${event.docs}`);
    expectNoDiagnostics(artifact, { allow: ["REACTIVE_WRITE_IN_OWNED_SCOPE"] });
  });

  test("records barq's own finding on the same channel", async () => {
    const { artifact } = await captureArtifact(() => render(() => <NameField />), {
      scenario: "bind a memo",
      attribution,
    });

    expectDiagnostic(artifact, "BIND_TARGET_NOT_WRITABLE", { count: 1 });
    const [event] = artifact.diagnostics;
    expect(event.kind).toBe("render");
    expect(event.ownerPath).toEqual(["<NameField>"]);
    expect(event.docs).toBe(
      "https://github.com/salamaashoush/barq/blob/main/packages/core/docs/diagnostics/BIND_TARGET_NOT_WRITABLE.md",
    );
    expect(messageOf(() => expectNoDiagnostics(artifact))).toContain(
      "  BIND_TARGET_NOT_WRITABLE (error) in <NameField>\n",
    );
  });

  test("attributes a click's re-runs to the write that caused them", async () => {
    const view = render(() => <Counter />);
    const button = view.getByRole("button");
    expect(button.textContent).toBe("0:true");

    const { artifact } = await captureArtifact(() => button.click(), {
      scenario: "counter click",
      attribution,
    });
    expect(button.textContent).toBe("2:true");

    expectNoDiagnostics(artifact);
    const reruns = artifact.attribution!.reruns;
    expect(reruns.map((rerun) => rerun.nodeName).toSorted()).toEqual([
      "button.children",
      "double",
      "whole",
    ]);
    expect(reruns.find((rerun) => rerun.nodeName === "double")!.causes[0].name).toBe("count");
    expect(reruns.find((rerun) => rerun.nodeName === "double")!.causes[0].origin).toMatchObject({
      kind: "interaction",
      name: "click",
      target: 'button "0:true"',
    });
    expect(artifact.attribution!.costs.writes.map((write) => write.name)).toEqual(["count"]);

    expectRerunBudget(artifact, 3);
    expectRerunBudget(artifact, 1, { scope: "double" });
    expect(messageOf(() => expectRerunBudget(artifact, 0, { scope: "double" }))).toContain(
      '"nodeName":"double","nodeKind":"memo","changed":true',
    );

    // `whole` recomputed to the value it already had.
    expect(messageOf(() => expectNoWaste(artifact))).toContain('"nodeName":"whole"');
    expectNoWaste(artifact, { maxWastedRuns: 1 });
    assertBudget(artifact, { maxReruns: 3, maxWastedRuns: 1, scopes: { double: 1, "/^wh/": 1 } });
  });

  test("counts only what ran during the scenario", async () => {
    const [count, setCount] = createSignal(0, { name: "count" });
    const seen: number[] = [];
    const dispose = createRoot((close) => {
      createRenderEffect(count, (value) => void seen.push(value), { name: "paint" });
      return close;
    });
    flush();
    setCount(1);
    flush();

    const { artifact } = await captureArtifact(() => setCount(2), { attribution });
    dispose();

    expect(seen).toEqual([0, 1, 2]);
    expect(artifact.attribution!.reruns.map((rerun) => rerun.nodeName)).toEqual(["paint"]);
  });

  test("captures findings only with attribution off", async () => {
    const { artifact } = await captureArtifact(() => render(() => <NameField />), {
      attribution: false,
    });
    expect(artifact.attribution).toBeNull();
    expectDiagnostic(artifact, "BIND_TARGET_NOT_WRITABLE");
    expect(messageOf(() => expectNoWaste(artifact))).toBe(
      "expectNoWaste needs attribution data, but the artifact was captured with `attribution: false`.",
    );
  });

  test("rethrows what the scenario threw and closes the capture", async () => {
    await expect(
      captureArtifact(() => {
        throw new Error("scenario failed");
      }),
    ).rejects.toThrow("scenario failed");

    const { artifact } = await captureArtifact(() => {}, { attribution });
    expect(artifact.diagnostics).toEqual([]);
    expect(artifact.attribution!.reruns).toEqual([]);
  });

  test("serializes to JSON and to one typed record per line", async () => {
    const view = render(() => (
      <Shell>
        <NameField />
        <Counter />
      </Shell>
    ));
    const { artifact } = await captureArtifact(
      () => {
        render(() => <NameField />);
        view.getByRole("button").click();
      },
      { scenario: "egress", attribution },
    );

    expect(JSON.parse(serializeArtifact(artifact)) as DiagnosticsArtifact).toEqual(
      JSON.parse(JSON.stringify(artifact)) as DiagnosticsArtifact,
    );

    const text = artifactToJSONL(artifact);
    expect(text).toEndWith("\n");
    const records = text
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records.map((record) => record.type)).toEqual([
      "meta",
      "diagnostic",
      "rerun",
      "rerun",
      "rerun",
      "costs",
      "feedback",
    ]);
    expect(records[0]).toEqual({
      type: "meta",
      formatVersion: 1,
      scenario: "egress",
      capturedAt: artifact.capturedAt,
      timeOrigin: artifact.timeOrigin,
      durationMs: artifact.durationMs,
      diagnosticCount: 1,
      rerunCount: 3,
      holdCount: 0,
    });
    expect(records[1].code).toBe("BIND_TARGET_NOT_WRITABLE");
    expect(records[1].docs).toBe(artifact.diagnostics[0].docs);
    expect(records[5].writes).toEqual(
      JSON.parse(JSON.stringify(artifact.attribution!.costs.writes)),
    );
  });
});

function wait(ms: number) {
  return new Promise((done) => setTimeout(done, ms));
}

async function until(condition: () => boolean, what: string): Promise<void> {
  const start = Date.now();
  for (;;) {
    flush();
    if (condition()) return;
    if (Date.now() - start > 5000) throw new Error(`timed out waiting for ${what}`);
    await wait(5);
  }
}

/**
 * `page` drives an async `posts` memo that a render effect shows. With `busy`
 * mounted, an `isPending` reader acknowledges every hold.
 */
function pagedFeed(busy: boolean) {
  const [page, setPage] = createSignal(1, { name: "page" });
  let land!: (value: string) => void;
  const posts = createMemo(
    () => {
      const current = page();
      return new Promise<string>((settle) => {
        land = (value) => settle(`${value}-p${current}`);
      });
    },
    { name: "posts" },
  );
  const shown: string[] = [];
  const dispose = createRoot((close) => {
    createRenderEffect(posts, (value) => void shown.push(value), { name: "feed" });
    if (busy) {
      createRenderEffect(
        () => isPending(() => posts()),
        () => {},
        { name: "busy" },
      );
    }
    return close;
  });
  flush();
  return {
    setPage,
    dispose,
    async load(value: string) {
      land(value);
      await until(() => shown.some((entry) => entry.startsWith(value)), `posts to show ${value}`);
    },
  };
}

async function turnPage(busy: boolean): Promise<DiagnosticsArtifact> {
  const feed = pagedFeed(busy);
  await feed.load("a");
  const { artifact } = await captureArtifact(
    async () => {
      OBSERVE!.attribution.withInteraction({ type: "click", target: "button#next" }, () =>
        feed.setPage(2),
      );
      flush();
      await wait(20);
      await feed.load("b");
    },
    // The console's hold thresholds are out of the way: the budget gives the verdict.
    {
      scenario: "next page",
      attribution: { hotTime: false, holds: { infoMs: 60_000, warnMs: 60_000 } },
    },
  );
  feed.dispose();
  return artifact;
}

describe.if(development)("holds", () => {
  test("a hold nothing acknowledged fails the responsiveness gate", async () => {
    const artifact = await turnPage(false);
    const holds = artifact.attribution!.holds;
    expect(holds).toHaveLength(1);
    expect(holds[0].blockers).toEqual(["posts"]);
    expect(holds[0].heldWrites.map((write) => write.name)).toEqual(["page"]);
    expect(holds[0].holdMs).toBeGreaterThanOrEqual(15);

    const message = messageOf(() => expectNoSilentHolds(artifact));
    expect(message).toStartWith("Expected no silent holds but attribution recorded 1");
    expect(message).toContain(
      '"interaction":"click on button#next","heldWrites":["page"],"blockers":["posts"]',
    );
    expectNoSilentHolds(artifact, { maxSilentMs: 60_000 });

    expect(messageOf(() => expectHoldBudget(artifact, 1, { source: "posts" }))).toStartWith(
      "Expected every hold on posts to settle within 1ms but 1 did not:",
    );
    expectHoldBudget(artifact, 60_000);
    expect(artifactToJSONL(artifact)).toContain('{"type":"hold","at":');
  });

  test("an isPending reader acknowledges the hold", async () => {
    const artifact = await turnPage(true);
    expect(artifact.attribution!.holds).toHaveLength(1);
    expectNoSilentHolds(artifact);
    assertBudget(artifact, { maxSilentHoldMs: 0, maxHoldMs: 60_000 });
  });
});
