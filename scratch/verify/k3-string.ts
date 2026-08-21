import { transform } from "../../packages/compiler-rs/index.js";

import { renderPage } from "../../packages/server/src/index.ts";

const SERVER_SRC = new URL("../../packages/server/src/index.ts", import.meta.url).pathname;
const CORE_SRC = new URL("../../packages/core/src/index.ts", import.meta.url).pathname;

const PAGE = `
import { computed, Loading } from ${JSON.stringify(CORE_SRC)};
export const state = { calls: 0 };
export default function Page() {
  const data = computed(async () => {
    state.calls++;
    await new Promise((r) => setTimeout(r, 5));
    return "Ada";
  }, { key: "r:/users/$id|{id:7}" });
  return <main><Loading fallback={<i>loading</i>}><b>{data()}</b></Loading></main>;
}
`;

const emitted = transform(PAGE, {
  filename: "page.tsx",
  ssr: true,
  serverSource: SERVER_SRC,
  moduleSource: CORE_SRC,
});
await Bun.write("./.k3mod.tsx", emitted.code);
const mod = (await import("./.k3mod.tsx")) as {
  default: (s: null, p: unknown) => unknown;
  state: { calls: number };
};

const out = await renderPage(() => mod.default(null, {}) as never);
console.log("STRING BACKEND, renderPage");
console.log("  loader invocations:", mod.state.calls);
console.log("  html:", out.html);
console.log("  seed:", JSON.stringify(out.data));
