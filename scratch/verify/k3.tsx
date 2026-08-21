import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
const { renderPage } = await import("../../packages/server/src/index.ts");
const { computed } = await import("../../packages/core/src/index.ts");
const { Loading } = await import("../../packages/core/src/index.ts");

let calls = 0;
function page() {
  const data = computed(async () => { calls++; await new Promise(r => setTimeout(r, 5)); return "Ada"; },
    { key: "r:/users/$id|{id:7}" });
  return Loading(null, {
    fallback: () => { const i = document.createElement("i"); i.textContent = "loading"; return i; },
    children: (s: unknown) => { const b = document.createElement("b"); b.textContent = String(data()); return b; },
  });
}
const out = await renderPage(() => page() as never);
console.log("loader invocations:", calls);
console.log("html:", out.html);
console.log("seed data:", JSON.stringify(out.data));
