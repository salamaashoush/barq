/**
 * The cells are created with NO owner, exactly as `router.ts` creates loader
 * cells — trap 1: a cell created inside the boundary's content scope dies with
 * that scope when the boundary parks on a string render.
 */
import { computed, runWithOwner } from "@barqjs/core";
import { esc, html as ssrHtml, renderPage, renderToStream, ssrLoading } from "@barqjs/server";

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

async function run(label: string, asyncFallback: boolean): Promise<void> {
  const data = runWithOwner(null, () =>
    computed(async () => { await tick(); return "content"; }, { key: `${label}:content` }),
  );
  const late = runWithOwner(null, () =>
    computed(async () => { await tick(); return "<i>skeleton</i>"; }, { key: `${label}:fallback` }),
  );
  const page = (): unknown =>
    ssrLoading(null, {
      fallback: () => (asyncFallback ? ssrHtml(String(late())) : ssrHtml("<i>plain</i>")),
      children: () => ssrHtml(`<b>${esc(data())}</b>`),
    });
  try {
    const out = await renderPage(page as never);
    const seed = out.script.match(/__BARQ_DATA__=\(([^)]*)\)/)?.[1] ?? "?";
    console.log(`${label.padEnd(8)} asyncFallback=${String(asyncFallback).padEnd(5)} html=${JSON.stringify(out.html).padEnd(22)} seed=${seed}`);
  } catch (error) {
    console.log(`${label.padEnd(8)} asyncFallback=${String(asyncFallback).padEnd(5)} THREW ${(error as Error).name}`);
  }
}

await run("sync", false);
await run("async", true);
