/**
 * RED-A3: the design says `staleReloadMode: 'background'` is just "read with
 * `latest(cell)`".  On the SERVER the read happens inside `ssrLoading`'s
 * children, which `activate` invokes with NO reactive observer.
 * `signals.ts:2153` short-circuits on `currentObserver === null` and returns
 * `node._value` — `undefined` for a cold cell — instead of throwing.
 *
 * If that holds, a `background` route SSRs as `undefined`, never parks, never
 * opens the seed channel (trap 3), and seeds nothing.
 */
import { html as ssrHtml, ssrLoading, renderPage, renderToStream } from "@barqjs/server";
import { computed, latest, runWithOwner } from "@barqjs/core";

for (const mode of ["blocking", "background"] as const) {
  let fetches = 0;
  const cell = runWithOwner(null, () =>
    computed(async () => {
      fetches++;
      await new Promise((r) => setTimeout(r, 10));
      return "ADA";
    }, { key: `r:rtA3-${mode}` }),
  );
  const read = (): unknown => (mode === "background" ? latest(cell) : cell());

  const page = await renderPage(() =>
    ssrLoading(null, {
      fallback: () => ssrHtml("<i>loading</i>"),
      children: () => ssrHtml(`<b>${String(read())}</b>`),
    }) as never,
  );
  console.log(`renderPage  mode=${mode.padEnd(10)} html=${JSON.stringify(page.html)} seed=${JSON.stringify(page.script.slice(0, 120))} fetches=${fetches}`);
}

for (const mode of ["blocking", "background"] as const) {
  let fetches = 0;
  const cell = runWithOwner(null, () =>
    computed(async () => {
      fetches++;
      await new Promise((r) => setTimeout(r, 10));
      return "ADA";
    }, { key: `r:rtA3s-${mode}` }),
  );
  const read = (): unknown => (mode === "background" ? latest(cell) : cell());
  const stream = renderToStream(() =>
    ssrLoading(null, {
      fallback: () => ssrHtml("<i>loading</i>"),
      children: () => ssrHtml(`<b>${String(read())}</b>`),
    }) as never,
  );
  let out = "";
  const reader = stream.getReader();
  const dec = new TextDecoder();
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; out += dec.decode(value); }
  } catch (e) { out += `<STREAM THREW ${(e as Error).name}>`; }
  console.log(`renderToStream mode=${mode.padEnd(10)} out=${JSON.stringify(out.slice(0, 260))} fetches=${fetches}`);
}
