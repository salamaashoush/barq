# @barqjs/diagnostics

Diagnostics an agent or a test suite can check mechanically. A development
build of barq has two sources of evidence: **findings** (coded events for a
write in a component body, a hydration mismatch, a `bind:` given the wrong
value, each with its owner path, source location and docs page) and
**attribution** (why every scope re-ran, what it cost, and what the user waited
on). This package captures both into one serializable artifact and puts
assertions, budgets, test matchers, a browser bridge and a dev-server endpoint
on top of it.

Development only. It needs the development build of `@solidjs/signals`, the
engine under `@barqjs/core`, which the `development` export condition selects.
In the production build `captureArtifact` throws and says so. None of this
belongs in a production bundle.

The design follows [`@solidjs/diagnostics`](https://github.com/solidjs/solid/tree/main/packages/diagnostics)
(MIT), ported to barq's findings channel and package names.

## Install

```bash
bun add -d @barqjs/diagnostics
```

## Capturing an artifact

```tsx
import { createMemo, createSignal } from "@barqjs/core";
import { captureArtifact, expectNoDiagnostics, expectRerunBudget } from "@barqjs/diagnostics";
import { render, screen } from "@barqjs/testing";
import { test } from "bun:test";

function Counter() {
  const [count, setCount] = createSignal(0, { name: "count" });
  const double = createMemo(() => count() * 2, { name: "double" });
  return (
    <button type="button" onClick={() => setCount((n) => n + 1)}>
      {double()}
    </button>
  );
}

test("a click re-runs the memo once", async () => {
  render(() => <Counter />);
  const { artifact } = await captureArtifact(() => screen.getByRole("button").click(), {
    scenario: "counter click",
  });
  expectNoDiagnostics(artifact);
  expectRerunBudget(artifact, 1, { scope: "double" });
});
```

Run it with `bun test --conditions=development`. Under vitest, `barq()` from
`@barqjs/vite` in the vitest config resolves the condition, since vitest serves
through a Vite dev server. Mount before the capture when the budget is about an
interaction, so the mount's own runs are not counted.

`captureArtifact(scenario, options)` returns `{ result, artifact }`. Options:

- `scenario`: a label stamped into the artifact. Budget files are keyed by it.
- `attribution`: `true` by default. `false` captures findings only. An object is
  passed to the engine's `attribution.enable()`.
- `autoFlush`: flush the reactive queue when the scenario returns. `true` by
  default.

A scenario that throws rejects the capture with what it threw. When the throw
is the subject (`REACTIVE_WRITE_IN_OWNED_SCOPE` throws in development), catch it
inside the scenario and the finding is in the artifact.

### The artifact

```ts
interface DiagnosticsArtifact {
  formatVersion: 1;
  scenario?: string;
  capturedAt: string; // ISO time the capture began
  timeOrigin: number; // epoch ms of the process's performance.now() zero
  durationMs: number;
  diagnostics: DiagnosticEvent[];
  attribution: {
    reruns: RerunEvent[];
    costs: AttributionCostTables;
    holds: HoldEvent[];
    feedback: AttributionFeedbackTables;
  } | null; // null with attribution: false
}
```

- `diagnostics` is what `DEV.diagnostics` from `@barqjs/core` delivered: the
  engine's codes and barq's own on one channel. Each event has `code`,
  `severity`, `message`, `docs` (the page for its code) and, from a development
  compile, `ownerPath` (`["<App>", "<Row>"]`) and `loc` (`file:line:col`).
- `attribution.reruns` is every re-run with its `causes`, `selfMs` and
  `changed`. A plain run with `changed: false` recomputed for nothing.
- `attribution.costs` ranks scopes by self time and root writes by downstream
  cost.
- `attribution.holds` is every write that waited on async work: what was held,
  what blocked it, for how long, and which affordance acknowledged it.
- `attribution.feedback` folds the holds into ranked tables per source,
  interaction, navigation, flight and fallback.

Every `at` is on the capturing process's `performance.now()` clock, so
`timeOrigin + at` is an absolute time.

`serializeArtifact(artifact)` is pretty JSON for a checked-in file.
`artifactToJSONL(artifact)` is one record per line, each with a `type`: `meta`
first, then `diagnostic`, `rerun`, `costs`, `hold`, `feedback`.

## Assertions

Each takes an artifact and throws `DiagnosticsAssertionError`. The error's
`evidence` holds the offending records, and the message names what to repair:

```text
Expected no diagnostics but captured 1:
  BIND_TARGET_NOT_WRITABLE (error) in <App> › <NameField>
    at src/NameField.tsx:6:10
    `bind:value` on `<input>` was given a value of type `function` instead of a signal, ...
    docs: https://github.com/salamaashoush/barq/blob/main/packages/core/docs/diagnostics/BIND_TARGET_NOT_WRITABLE.md
```

- `expectNoDiagnostics(artifact, { allow? })`: no findings outside the allow list.
- `expectDiagnostic(artifact, code, { count? })`: the code was captured.
- `expectRerunBudget(artifact, max, { scope? })`: at most `max` re-runs, in
  total or for scopes matching a name or pattern.
- `expectNoWaste(artifact, { maxWastedRuns?, maxWastedMs? })`: no plain run
  recomputed to the value it already had.
- `expectNoSilentHolds(artifact, { maxSilentMs? })`: every hold was acknowledged
  on screen by an `isPending()` or `latest()` reader, an optimistic value, an
  `affects()` mark, or an effect that painted. The repair is to add the
  feedback, not to remove the hold.
- `expectHoldBudget(artifact, maxMs, { source? })`: no hold outlasted `maxMs`.

## Budgets

A budget states the same bounds as data. Only stated bounds are enforced, and
findings always are:

```json
{
  "formatVersion": 1,
  "scenarios": {
    "counter click": {
      "allow": [],
      "maxReruns": 2,
      "maxWastedRuns": 0,
      "scopes": { "double": 1, "/Row$/": 1 },
      "maxSilentHoldMs": 0,
      "maxHoldMs": 500
    }
  }
}
```

```ts
import { assertBudget, assertBudgetFile, parseBudgetFile } from "@barqjs/diagnostics";

assertBudget(artifact, { maxReruns: 2, scopes: { double: 1 } });

const budgets = parseBudgetFile(await Bun.file("budgets.json").text());
assertBudgetFile(artifact, budgets); // looks the budget up by artifact.scenario
```

A scenario with no entry in the file fails.

## Matchers

`install(expect)` registers the matchers on `bun:test`'s `expect` or vitest's.
Import it from the entry for your runner, which also carries the types:

```ts
// bun test: in a preload
import { expect } from "bun:test";
import { install } from "@barqjs/diagnostics/matchers/bun";

install(expect);
```

```ts
// vitest: in a setupFiles entry
import { expect } from "vitest";
import { install } from "@barqjs/diagnostics/matchers/vitest";

install(expect);
```

```ts
expect(artifact).toHaveNoDiagnostics();
expect(artifact).toHaveDiagnostic("HYDRATION_MISMATCH");
expect(artifact).toStayWithinRerunBudget(2, { scope: "double" });
expect(artifact).toHaveNoWaste();
expect(artifact).toHaveNoSilentHolds();
expect(artifact).toStayWithinHoldBudget(500);
expect(artifact).toStayWithinBudget(budget);
```

`@barqjs/diagnostics/matchers` exports the same `install` and the `matchers`
table with no runner types, for any `expect` that has `extend`.

## A real page

`barqDiagnostics()` adds the bridge to the page and an endpoint to the dev
server:

```ts
// vite.config.ts
import { barqDiagnostics } from "@barqjs/diagnostics/vite";
import barq from "@barqjs/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [barq(), barqDiagnostics()] });
```

It applies to `vite dev` only. An app with an `index.html` gets the bridge
injected. An app without one connects it from its client entry:

```ts
import { connectDiagnosticsBridge, installDiagnosticsBridge } from "@barqjs/diagnostics/browser";

if (import.meta.hot) connectDiagnosticsBridge(installDiagnosticsBridge(), import.meta.hot);
```

The bridge has to be bundled with the app: it needs the app's own engine
instance. It lives on `globalThis.__BARQ_DIAGNOSTICS__`.

### The endpoint

`/__barq/diagnostics` on the dev server:

```sh
curl -X POST localhost:5173/__barq/diagnostics -d '{"method":"begin","params":{"scenario":"add todo"}}'
# interact with the page
curl -X POST localhost:5173/__barq/diagnostics -d '{"method":"whyDidRun","params":{"name":"TodoRow"}}'
curl -X POST localhost:5173/__barq/diagnostics -d '{"method":"end"}'   # the artifact, also stored
curl localhost:5173/__barq/diagnostics                                 # { artifacts, clients, methods }
curl 'localhost:5173/__barq/diagnostics?format=jsonl'                  # the same, one record per line
curl -X DELETE localhost:5173/__barq/diagnostics                       # clear the store
```

- `GET` answers with the stored artifacts, oldest first, and how many pages are
  connected. `?format=jsonl` answers with `artifactToJSONL` of each.
- `POST` with a method call forwards it to the page: `begin`, `end`, `active`,
  `whyDidRun`, `costs`, `holds`, `feedback`. `end` answers with the artifact
  and stores it. With several tabs open the first to answer wins, so keep one
  page under test. No page is `503`, no answer in time is `504`, and an error
  from the bridge is `400` with its message.
- `POST` with an artifact stores it. `publishArtifact(bridge.end())` from
  `@barqjs/diagnostics/browser` does that from the page.
- `DELETE` clears the store.

The store keeps the newest 20 artifacts (`barqDiagnostics({ keep })`).
`@barqjs/diagnostics/protocol` has the endpoint path, the event names and the
request and response types.

### Playwright

`captureBrowserArtifact` drives the bridge through `page.evaluate`. It is typed
structurally, so Playwright is not a dependency and any page-like object with a
compatible `evaluate` works:

```ts
import { assertBudget } from "@barqjs/diagnostics";
import { captureBrowserArtifact } from "@barqjs/diagnostics/playwright";

const { artifact } = await captureBrowserArtifact(page, (page) => page.click("#add-todo"), {
  scenario: "add todo",
});
assertBudget(artifact, { maxSilentHoldMs: 0, scopes: { "/TodoRow/": 1 } });
```

## For agents

[`skills/agent-loops/SKILL.md`](./skills/agent-loops/SKILL.md) ships with the
package: when to capture, how to read the artifact, and the loop from a finding
to its repair. The repair for each code is in
`@barqjs/core/skills/diagnostics/SKILL.md`.

## License

MIT
