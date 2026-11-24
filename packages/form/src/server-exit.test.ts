import { describe, expect, test } from "bun:test";

/**
 * In a process with no DOM, where `isServer` is true; this suite's own setup
 * registers one, so the server path can only be measured in a child.
 */
describe("a form on the server", () => {
  test("lets the process exit at once rather than polling for devtools", async () => {
    const probe = new URL("./server-exit-probe.ts", import.meta.url).pathname;
    const started = performance.now();
    const child = Bun.spawn(["bun", "run", probe], { stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const elapsed = performance.now() - started;
    if (code !== 0) throw new Error(`the probe exited ${code}: ${err}`);
    expect(JSON.parse(out)).toEqual({ bus: true });
    // The devtools client's poll would hold it for five seconds.
    expect(elapsed).toBeLessThan(2500);
  });
});
