import { signal } from "@barqjs/core";
import { createSignal } from "@solidjs/signals";
function bench(name: string, fn: () => unknown): void {
  for (let i = 0; i < 50000; i++) fn();
  Bun.gc(true);
  let best = Infinity;
  for (let r = 0; r < 5; r++) {
    const t = Bun.nanoseconds();
    for (let i = 0; i < 200000; i++) fn();
    const per = (Bun.nanoseconds() - t) / 200000;
    if (per < best) best = per;
  }
  console.log(`${name.padEnd(40)}${best.toFixed(1).padStart(7)} ns`);
}
bench("barq signal(0)", () => signal(0));
bench("solid2 createSignal(0)", () => createSignal(0));
bench("barq signal(0) w/ options", () => signal(0, { name: "x" }));
