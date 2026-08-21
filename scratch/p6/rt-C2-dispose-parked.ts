/**
 * RED-C2: §1.4 "gc DISPOSES" — the commit-time sweep calls `entry.dispose()`,
 * which aborts the in-flight request. What happens to a `Loading` boundary that
 * is PARKED on that entry when the sweep runs?
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({ url: "http://localhost/" });

const core = await import("@barqjs/core");
const { resource, flush, scope, block, boundary, render, root } = core as never as {
  resource: typeof import("@barqjs/core").resource;
  flush: () => void;
  scope: (fn: (d: () => void, s: unknown) => unknown) => unknown;
  block: (fn: (s: unknown) => unknown) => unknown;
  boundary: (...a: unknown[]) => unknown;
  render: (el: unknown, c: unknown) => unknown;
  root: <T>(fn: (d: () => void, s: unknown) => T) => T;
};

const tick = async (): Promise<void> => { flush(); await new Promise((r) => setTimeout(r, 5)); flush(); };

const container = document.createElement("div");
document.body.append(container);

let disposeEntry: (() => void) | null = null;
let aborted = "no";
const entry = root((d) => {
  disposeEntry = d;
  return resource(() => "s", async (_s, info) => {
    info.signal.addEventListener("abort", () => { aborted = String(info.signal.reason); });
    await new Promise((r) => setTimeout(r, 200));
    return "DATA";
  }, { key: "rtC2" });
});

let unhandled: unknown = null;
process.on("unhandledRejection", (e) => { unhandled = e; });

scope(() => {
  const el = boundary(null, null, null, "loading",
    block(() => document.createTextNode("FALLBACK")),
    block(() => document.createTextNode(String((entry as () => unknown)()))),
    0);
  render(el, container);
});

await tick();
console.log("parked        :", JSON.stringify(container.textContent));
disposeEntry?.();
console.log("after dispose :", JSON.stringify(container.textContent), "aborted:", aborted);
for (let i = 0; i < 60; i++) await tick();
console.log("300ms later   :", JSON.stringify(container.textContent), "aborted:", aborted);
console.log("unhandled rejection:", unhandled === null ? "none" : String(unhandled));
