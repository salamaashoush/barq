/** `bun src/bench.ts` — what a re-render costs on the runtime path. */
import { atoms } from "./atoms.ts";
import { variants } from "./variants.ts";

const button = variants({
  base: "base",
  variants: { size: { sm: "s", lg: "l" }, tone: { a: "a", b: "b" } },
  defaults: { size: "sm", tone: "a" },
});

function time(label: string, runs: number, fn: () => unknown): void {
  fn();
  const start = Bun.nanoseconds();
  for (let index = 0; index < runs; index++) fn();
  const each = (Bun.nanoseconds() - start) / runs;
  console.log(`${label.padEnd(34)} ${each.toFixed(0).padStart(6)} ns/call`);
}

let flip = false;
time("atoms, 4 declarations, cold-ish", 200_000, () =>
  atoms({ color: "red", padding: 8, display: "flex", gap: 4 }),
);
time("atoms, with a conditional arg", 200_000, () => {
  flip = !flip;
  return atoms({ color: "red", padding: 8 }, flip && { color: "blue" });
});
time("atoms, a shorthand expanded", 200_000, () => atoms({ margin: "0 4px" }));
time("variants, two axes", 200_000, () => button({ size: "lg" }));
