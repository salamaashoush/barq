---
name: agent-loops
description: Verify barq reactive code with evidence from @barqjs/diagnostics captureArtifact instead of reading it. Covers the capture, read the finding, repair, re-capture loop, re-run and hold budgets, and the /__barq/diagnostics dev-server endpoint. Use when checking that generated or ported barq components are quiet, re-run only for the right reasons and acknowledge every wait.
---

# Agent loops with @barqjs/diagnostics

A development build of barq gives two kinds of evidence: findings (stable codes
for known defects, each with where it happened and a docs page) and attribution
(every re-run with its cause and cost, every hold with what acknowledged it).
`captureArtifact` records both into one serializable artifact. Use it to verify
a claim about reactive code. Do not infer the claim from reading the code.

Every loop is the same four steps: **capture, read the finding, repair,
re-capture**. Stop when the artifact is quiet and within budget.

## Capture

```tsx
import { captureArtifact } from "@barqjs/diagnostics";
import { render, screen } from "@barqjs/testing";

render(() => <TodoList />); // mount first: the budget is about the interaction

const { artifact } = await captureArtifact(
  () => screen.getByRole("button", { name: "Add" }).click(),
  { scenario: "todo add" },
);
```

Run under the `development` export condition: `bun test --conditions=development`
or a Vite dev server. Under the production build `captureArtifact`
throws "needs the development build of @solidjs/signals". That is a setup
error, not a result.

Capture when:

- you generated or ported a component: capture its mount and each interaction;
- a budget or a test failed and you need the cause;
- something is slow or a click appears to do nothing.

A scenario that throws rejects the capture. `REACTIVE_WRITE_IN_OWNED_SCOPE`
throws in development: to assert on it, catch inside the scenario.

## Read the artifact

- `artifact.diagnostics[]`: one event per finding. `code` is stable.
  `ownerPath` is the component path (`["<App>", "<TodoRow>"]`), `loc` is
  `file:line:col`, `docs` is the URL of the page for the code. Read `message`
  first: it states the repair.
- `artifact.attribution.reruns[]`: `nodeName`, `causes` (the change chain back
  to the root write), `selfMs`, `changed`, `phase`. `changed: false` with
  `phase: "plain"` is a wasted run.
- `artifact.attribution.costs`: `scopes` ranked by self time with `wastedMs`,
  `writes` ranked by downstream cost.
- `artifact.attribution.holds[]`: `heldWrites`, `blockers`, `holdMs`,
  `interaction`, `acknowledgements`, `paintedDuringHold`.
- `artifact.attribution.feedback`: `sources`, `interactions`, `navigations`,
  `flights`, `fallbacks`, each ranked.

`attribution` is `null` when the capture ran with `attribution: false`.

For a large artifact, `artifactToJSONL(artifact)` gives one record per line
with a `type` (`meta`, `diagnostic`, `rerun`, `costs`, `hold`, `feedback`).
Grep it, or diff two runs.

## Loop 1: quiet (no findings)

```ts
import { expectNoDiagnostics } from "@barqjs/diagnostics";

expectNoDiagnostics(artifact);
```

A failure reads:

```text
Expected no diagnostics but captured 1:
  BIND_TARGET_NOT_WRITABLE (error) in <App> › <NameField>
    at src/NameField.tsx:6:10
    `bind:value` on `<input>` was given a value of type `function` instead of a signal, ...
    docs: https://github.com/salamaashoush/barq/blob/main/packages/core/docs/diagnostics/BIND_TARGET_NOT_WRITABLE.md
```

1. Open the file at `at`. The owner path says which component instance.
2. Look the code up in `node_modules/@barqjs/core/skills/diagnostics/SKILL.md`,
   or open `docs`. Both give the repair.
3. Repair the cause in the source. Re-capture.

Do not add a code to `allow` unless you understand it and the user accepted it.
Every code is a real defect or a real cost.

## Loop 2: acceptance (scenario plus budget is the definition of done)

```ts
import { assertBudget } from "@barqjs/diagnostics";

assertBudget(artifact, {
  allow: [], // tolerated codes
  maxReruns: 2, // total re-runs the interaction may cause
  maxWastedRuns: 0, // plain runs that recomputed an unchanged value
  scopes: { TodoRow: 1, "/Count$/": 1 }, // per scope; "/pattern/" keys are regular expressions
  maxSilentHoldMs: 0, // every hold was acknowledged on screen
});
```

Keep budgets in a checked-in JSON file keyed by scenario name and enforce it
with `assertBudgetFile(artifact, parseBudgetFile(text))`, so a regression is a
test failure. With the matchers installed
(`install(expect)` from `@barqjs/diagnostics/matchers/bun` or
`@barqjs/diagnostics/matchers/vitest`):

```ts
expect(artifact).toHaveNoDiagnostics();
expect(artifact).toStayWithinRerunBudget(1, { scope: /TodoRow/ });
expect(artifact).toHaveNoWaste();
expect(artifact).toStayWithinBudget(budget);
```

## Loop 3: attribution (why did this run)

When a re-run budget fails, the message lists each run with its `causes`. Do
not guess. Start from the top of `costs.scopes` and `costs.writes`, then read
the `causes` of the runs you did not expect. The usual repairs:

- a wasted run (`changed: false`): put a `createMemo` between the cause and the
  scope, so the equality check stops the change;
- a scope that runs for an unrelated write: it reads too much. Split the read,
  or read a store field instead of the whole object;
- every row of a list runs for one row's change: the rows read a shared signal.
  Move the per-row value into a store keyed by id;
- a memo whose output is a new object each time: return a primitive, or give
  it an `equals`.

Re-capture after each change and compare the re-run counts.

## Loop 4: responsiveness (the click did something, visibly)

The engine holds a write that lands on async work until the data settles, so
the screen never shows half an update. That is correct. Unless something on
screen acknowledges the wait, the user sees a click that did nothing.

```ts
import { expectNoSilentHolds } from "@barqjs/diagnostics";

expectNoSilentHolds(artifact); // names the interaction, the held write and the blocker
```

When it fails, read `feedback.sources` for the source that is silent, then
repair in this order:

1. **Show the wait.** Read `isPending(() => blocker())` in the affected UI and
   render a busy state.
2. **Show the input.** `latest(heldSignal)` gives the new value of the held
   write (page number, filter, query) while the data catches up.
3. **Predict the outcome.** `createOptimistic` or `createOptimisticStore`,
   written beside the real write, shows the expected result now and reverts on
   failure. For an `action` this is the first choice.

Never make the assertion pass by moving the write off the async path, wrapping
it in `untrack`, or splitting the read so it commits sooner. That trades the
hold for a torn screen.

`expectHoldBudget(artifact, ms)` is the separate latency gate: acknowledged or
not, no hold may outlast it. Use it with a mocked source that should settle in
a known time.

In a test, wrap the write so the hold is measured from the event and named by
it:

```ts
import { OBSERVE } from "@barqjs/core";

OBSERVE!.attribution.withInteraction({ type: "click", target: "button#next" }, () => setPage(2));
```

## A running app

With `barqDiagnostics()` from `@barqjs/diagnostics/vite` in the Vite plugins,
the dev server prints the endpoint at startup and no test harness is needed:

```sh
curl -X POST localhost:5173/__barq/diagnostics -d '{"method":"begin","params":{"scenario":"todo add"}}'
# perform the interaction in the browser
curl -X POST localhost:5173/__barq/diagnostics -d '{"method":"whyDidRun","params":{"name":"TodoRow"}}'
curl -X POST localhost:5173/__barq/diagnostics -d '{"method":"end"}'
curl 'localhost:5173/__barq/diagnostics?format=jsonl'
curl -X DELETE localhost:5173/__barq/diagnostics
```

- `begin` opens a session in the page, `end` closes it, answers
  `{ "result": artifact }` and stores the artifact.
- `whyDidRun`, `costs`, `holds`, `feedback` and `active` query the open session
  without closing it.
- `GET` answers `{ artifacts, clients, methods }`. `clients: 0` means no page
  is open: open the app in a browser first. `503` says the same on a `POST`.
- `504` means the open page did not answer: reload it.
- Keep one tab open. With several, the first to answer wins.

For a scripted browser, `captureBrowserArtifact(page, interact, { scenario })`
from `@barqjs/diagnostics/playwright` returns the same artifact, and every
assertion above applies to it.

## Rules

1. **Name scopes.** Pass `{ name }` to `createSignal`, `createMemo` and
   `createEffect` in code under test. Attribution is as readable as its names.
2. **One interaction per scenario.** A budget means something when the
   scenario is one click, one keystroke or one value landing.
3. **Mount outside the capture** when the budget is about an interaction.
4. **Development build only.** A capture under the production build is a setup
   error.
5. **Repair the cause.** Do not allow-list, weaken a budget or delete an
   assertion to get a green run. Report what you could not repair.
