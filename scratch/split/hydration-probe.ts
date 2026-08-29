/**
 * Does the reference application still HYDRATE, with its components in chunks
 * of their own?
 *
 * The split is the riskiest part of the change by a distance: a component
 * behind a cold `lazy()` throws `NotReadyError`, which parks its depth's
 * boundary and makes it REBUILD — discarding exactly the server markup
 * hydration exists to keep. A page that does that still looks right; it looks
 * right because it threw the server's work away and re-rendered. So the measure
 * is node IDENTITY, not markup.
 */
import { withChrome } from "../../packages/compiler-rs/test/chrome.ts";

const URL_ = process.argv[2] ?? "http://localhost:4321/";

await withChrome(async (page) => {
  // The harness opens `about:blank` and `open()` creates a NEW target — which
  // swaps the session, so a script registered before it lands on the target
  // that was replaced. Register against the blank target and NAVIGATE it.
  await page.send("Page.enable", {});
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__errors = [];
      addEventListener("error", (e) => window.__errors.push(String(e.message)));
      addEventListener("unhandledrejection", (e) => window.__errors.push("rejection: " + e.reason));
      // Stamp every element the PARSER inserts, and stop the moment the
      // document is parsed — which is before a deferred module entry runs, so
      // anything the client builds afterwards is unstamped by construction.
      window.__marked = 0;
      const stamp = (root) => {
        for (const el of root.querySelectorAll ? root.querySelectorAll("*") : []) {
          if (!el.hasAttribute("data-probe")) el.setAttribute("data-probe", String(window.__marked++));
        }
      };
      const observer = new MutationObserver(() => stamp(document));
      observer.observe(document, { childList: true, subtree: true });
      document.addEventListener("readystatechange", () => {
        if (document.readyState !== "interactive") return;
        stamp(document);
        observer.disconnect();
        window.__stamped = window.__marked;
      });
    `,
  });
  await page.send("Page.navigate", { url: URL_ });

  const report = await page.evaluate<{
    marked: number;
    kept: number;
    errors: string[];
    title: string;
    text: string;
    navs: number;
  }>(`(async () => {
    const deadline = Date.now() + 8000;
    // Hydration is awaited inside the client entry, so poll for the app to be
    // interactive rather than for a fixed time.
    while (Date.now() < deadline && !document.querySelector("#app *")) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 800));
    let kept = 0;
    for (const el of document.querySelectorAll("[data-probe]")) kept++;
    return {
      marked: window.__stamped ?? -1,
      kept,
      errors: window.__errors ?? [],
      title: document.title,
      text: (document.querySelector("#app")?.textContent ?? "").slice(0, 120),
      navs: document.querySelectorAll("nav a").length,
    };
  })()`);

  console.log(JSON.stringify(report, null, 2));

  // Interactivity, and then a NAVIGATION — which is where a split chunk is
  // fetched for the first time. A route whose component never arrives renders
  // its pending fallback forever, and the page still "looks fine".
  const after = await page.evaluate<{
    clicked: string | null;
    navigated: string;
    title: string;
    chunks: number;
    errors: string[];
  }>(`(async () => {
    const before = performance.getEntriesByType("resource").filter((r) => r.name.endsWith(".js")).length;
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "+1");
    const before2 = (() => {
      const node = [...document.querySelectorAll("*")].find(
        (el) => el.children.length === 0 && el.textContent.trim().startsWith("Count:"),
      );
      return node ? node.textContent.trim() : "no counter";
    })();
    button?.click();
    await new Promise((r) => setTimeout(r, 150));
    const readCount = () => {
      const node = [...document.querySelectorAll("*")].find(
        (el) => el.children.length === 0 && el.textContent.trim().startsWith("Count:"),
      );
      return node ? node.textContent.trim() : "no counter";
    };
    const counter = readCount();

    const link = [...document.querySelectorAll("nav a")].find((a) => a.getAttribute("href") === "/store");
    link?.click();
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && !/Store/.test(document.querySelector("h1")?.textContent ?? "")) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 400));
    // On the STORE page, whose chunk was just fetched: clicking there proves the
    // freshly-loaded split chunk is live, not merely painted.
    const beforeStore = document.querySelector("main")?.textContent ?? "";
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Increment")?.click();
    await new Promise((r) => setTimeout(r, 150));
    const afterStore = document.querySelector("main")?.textContent ?? "";

    return {
      clicked: before2 + " -> " + counter,
      storeReacted:
        (beforeStore.includes("Count: 0") ? "was 0" : "was ?") +
        " -> " +
        (afterStore.includes("Count: 1") ? "now 1" : afterStore.includes("Count: 0") ? "STILL 0" : "?"),
      navigated: "h1=" + (document.querySelector("h1")?.textContent ?? "?") +
        " | main=" + (document.querySelector("main")?.textContent ?? "").slice(0, 120),
      title: document.title,
      chunks: performance.getEntriesByType("resource").filter((r) => r.name.endsWith(".js")).length - before,
      errors: window.__errors ?? [],
    };
  })()`);
  console.log("AFTER INTERACTION", JSON.stringify(after, null, 2));
  const reuse = report.marked > 0 ? (report.kept / report.marked) * 100 : 0;
  console.log(`REUSE ${reuse.toFixed(1)}%  (${report.kept}/${report.marked} server nodes kept)`);
});
