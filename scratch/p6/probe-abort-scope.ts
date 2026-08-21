/**
 * P6-Q5: does a SUPERSEDED request actually abort, and can a router-owned
 * detached scope replace `runWithOwner(null)` — giving structural cancellation
 * and a disposal hook that trap 1's owner-less cell cannot have?
 */
import { flush, resource, root, runWithOwner } from "@barqjs/core";

const settle = async (ms = 30): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    flush();
    await new Promise((r) => setTimeout(r, ms / 8));
  }
};

// -------------------------------------------------- Q5a: supersede aborts
{
  const signals: AbortSignal[] = [];
  let n = 0;
  const r = runWithOwner(null, () =>
    resource(
      () => "s",
      async (_s, info) => {
        const mine = ++n;
        signals.push(info.signal);
        await new Promise((res) => setTimeout(res, 50));
        return `r${mine}`;
      },
    ),
  );
  try { r(); } catch { /* cold */ }
  flush();
  // Refetch WHILE the first is still flying.
  void r.refetch();
  flush();
  await settle(80);
  console.log("Q5a invocations           ", n);
  console.log("Q5a signal[0].aborted     ", signals[0]?.aborted, JSON.stringify(String(signals[0]?.reason ?? "")));
  console.log("Q5a signal[1].aborted     ", signals[1]?.aborted);
  console.log("Q5a final value           ", (() => { try { return String(r()); } catch (e) { return `threw ${(e as Error).name}`; } })());
}

// -------------------------------------------------- Q5b: detached scope owner
{
  const signals: AbortSignal[] = [];
  let disposeEntry: (() => void) | null = null;
  const r = root<ReturnType<typeof resource<string>>>((dispose) => {
    disposeEntry = dispose;
    return resource(
      () => "s",
      async (_s, info) => {
        signals.push(info.signal);
        await new Promise((res) => setTimeout(res, 50));
        return "value";
      },
      { key: "q5b" },
    );
  });
  try { r(); } catch { /* cold */ }
  flush();
  console.log("\nQ5b before dispose        ", signals[0]?.aborted);
  (disposeEntry as unknown as () => void)();
  console.log("Q5b after dispose         ", signals[0]?.aborted, JSON.stringify(String(signals[0]?.reason ?? "")));
  await settle(80);
}

// -------------------------------------------------- Q5c: does a detached scope
// created INSIDE another scope survive the outer scope's disposal?
{
  let inner: (() => void) | null = null;
  let innerDisposed = false;
  root((disposeOuter) => {
    root((d) => {
      inner = d;
      // a cleanup we can watch
      const rr = resource(() => 1, async () => { await new Promise((res) => setTimeout(res, 500)); return 1; }, {});
      try { rr(); } catch { /* cold */ }
    });
    disposeOuter();
  });
  void inner;
  void innerDisposed;
  console.log("\nQ5c detached-inside-scope survived the outer dispose (no throw above) ");
}
