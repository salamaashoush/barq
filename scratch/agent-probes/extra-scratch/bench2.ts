import { matchRoutes, compilePath, matchPath } from "../src/router.ts";

const n = 200;
const routes: any[] = [];
for (let i = 0; i < n; i++) routes.push({ path: `/r${i}/:a/:b`, component: () => null });

// The CHEAP fix: bucket by first static segment, keep the SAME regexes.
const bucket = new Map<string, any[]>();
for (const r of routes) {
  const head = r.path.split("/")[1];
  if (!bucket.has(head)) bucket.set(head, []);
  bucket.get(head)!.push(r);
}
function bucketed(pathname: string) {
  const head = pathname.split("/", 2)[1];
  const cand = bucket.get(head);
  if (!cand) return null;
  for (const r of cand) { const m = matchPath(pathname, compilePath(r.path)); if (m) return { route: r, params: m }; }
  return null;
}

function bench(label: string, fn: () => unknown, iters = 300_000) {
  for (let i = 0; i < 30_000; i++) fn();
  const s: number[] = [];
  for (let t = 0; t < 7; t++) { const t0 = Bun.nanoseconds(); for (let i = 0; i < iters; i++) fn(); s.push((Bun.nanoseconds() - t0) / iters); }
  s.sort((a, b) => a - b);
  console.log(`${label.padEnd(40)} ${s[3].toFixed(1)} ns`);
}
matchRoutes("/r199/x/y", routes); bucketed("/r199/x/y");
bench("linear scan, last of 200", () => matchRoutes("/r199/x/y", routes));
bench("first-segment Map bucket, last of 200", () => bucketed("/r199/x/y"));
bench("bucket, miss", () => bucketed("/nope/x/y"));

console.log("\n--- claimed baseline bugs ---");
console.log("paramNames of /a/:id/b/:rest*  =>", JSON.stringify(compilePath("/a/:id/b/:rest*").paramNames));
try { compilePath("/c++"); console.log("/c++ compiled OK, regex =", compilePath("/c++").regex); }
catch (e: any) { console.log("/c++ THREW:", e.constructor.name, e.message); }
try { compilePath("/a(b"); } catch (e: any) { console.log("/a(b :", e.constructor.name); }
console.log("\n--- specificity: first declaration wins? ---");
const r2: any[] = [{ path: "/users/:id", component: 1 }, { path: "/users/new", component: 2 }];
console.log("match /users/new =>", JSON.stringify(matchRoutes("/users/new", r2)?.route?.path), "params", JSON.stringify(matchRoutes("/users/new", r2)?.params));
