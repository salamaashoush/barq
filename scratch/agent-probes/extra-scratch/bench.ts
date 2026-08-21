import { matchRoutes, compilePath } from "../src/router.ts";

function mk(n: number) {
  const routes: any[] = [];
  for (let i = 0; i < n; i++) routes.push({ path: `/r${i}/:a/:b`, component: () => null });
  return routes;
}

function bench(label: string, fn: () => unknown, iters = 200_000) {
  for (let i = 0; i < 20_000; i++) fn();           // warm
  const samples: number[] = [];
  for (let t = 0; t < 7; t++) {
    const t0 = Bun.nanoseconds();
    for (let i = 0; i < iters; i++) fn();
    samples.push((Bun.nanoseconds() - t0) / iters);
  }
  samples.sort((a, b) => a - b);
  console.log(`${label.padEnd(34)} ${samples[3].toFixed(1)} ns  (min ${samples[0].toFixed(1)} max ${samples[6].toFixed(1)})`);
  return samples[3];
}

for (const n of [25, 200, 1000]) {
  const routes = mk(n);
  // prime the compilePath cache
  matchRoutes(`/r0/x/y`, routes);
  matchRoutes(`/r${n - 1}/x/y`, routes);
  console.log(`\n--- ${n} flat routes /rN/:a/:b ---`);
  bench(`first hit  (n=${n})`, () => matchRoutes(`/r0/x/y`, routes));
  bench(`last hit   (n=${n})`, () => matchRoutes(`/r${n - 1}/x/y`, routes));
  bench(`miss       (n=${n})`, () => matchRoutes(`/nope/x/y`, routes));
}

// Is a single regex exec really the cost, or is it the allocation?
const p = compilePath("/r199/:a/:b");
bench("bare regex exec (1 route)", () => "/r199/x/y".match(p.regex));
bench("bare regex test (1 route)", () => p.regex.test("/r199/x/y"));
// what a compiled switch would cost, roughly: split + switch
const parts = (s: string) => s.split("/");
bench("split only", () => parts("/r199/x/y"));
