/**
 * P6-Q2..Q4: what the reload primitives actually do.
 *
 * Q3  `refresh()` on a keyed async computed — does it re-run, and what does a
 *     read see WHILE the new promise is in flight?  This decides whether
 *     `staleReloadMode: 'blocking' | 'background'` needs new machinery or is
 *     `read()` vs `latest(read)`.
 * Q4  `resource()` created with NO OWNER — trap 1 says a loader cell must have
 *     none.  Does it still fetch, seed, abort and report state?
 */
import { computed, flush, isPending, latest, refresh, resource, runWithOwner } from "@barqjs/core";

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    flush();
    await new Promise((r) => setTimeout(r, 5));
  }
};

const read = (cell: () => unknown): string => {
  try {
    return `value=${String(cell())}`;
  } catch (error) {
    return `threw ${(error as Error).name}`;
  }
};

// ---------------------------------------------------------------- Q3
{
  let n = 0;
  const cell = runWithOwner(null, () =>
    computed(
      async () => {
        const mine = ++n;
        await new Promise((r) => setTimeout(r, 20));
        return `v${mine}`;
      },
      { key: "q3" },
    ),
  );

  console.log("Q3 first read (cold)        ", read(cell));
  await settle();
  console.log("Q3 after settle             ", read(cell));

  refresh(cell);
  flush();
  console.log("Q3 during refresh  read()   ", read(cell));
  console.log("Q3 during refresh  latest() ", read(() => latest(cell)));
  console.log("Q3 during refresh  isPending", isPending(() => cell()));
  await settle();
  console.log("Q3 after refresh settles    ", read(cell));
  console.log("Q3 invocations              ", n);
}

// ---------------------------------------------------------------- Q4
{
  let n = 0;
  const seenSignals: AbortSignal[] = [];
  const r = runWithOwner(null, () =>
    resource(
      () => "src",
      async (_source, info) => {
        n++;
        seenSignals.push(info.signal);
        await new Promise((res) => setTimeout(res, 20));
        return `r${n}`;
      },
      { key: "q4" },
    ),
  );

  console.log("\nQ4 state before read        ", read(() => r.state()));
  console.log("Q4 first read (cold)        ", read(r));
  await settle();
  console.log("Q4 after settle             ", read(r), read(() => r.state()));

  void r.refetch();
  flush();
  console.log("Q4 during refetch read()    ", read(r));
  console.log("Q4 during refetch latest()  ", read(() => r.latest()));
  console.log("Q4 during refetch state()   ", read(() => r.state()));
  await settle();
  console.log("Q4 after refetch settles    ", read(r), read(() => r.state()));
  console.log("Q4 invocations              ", n);
  console.log("Q4 first signal aborted?    ", seenSignals[0]?.aborted, "reason:", String(seenSignals[0]?.reason ?? ""));
}
