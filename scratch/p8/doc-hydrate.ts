import { hydrate } from "../../packages/core/src/index.ts";

const html = `<!doctype html><html lang="en"><head><title>SERVED</title></head><body><div id="app">hi</div></body></html>`;
document.documentElement.remove();
// happy-dom: rebuild the document from the served bytes
document.write(html);

console.log("childNodes of document:", [...document.childNodes].map((n) => n.nodeName).join(", "));
console.log("documentElement children:", [...document.documentElement.childNodes].map((n) => n.nodeName).join(", "));

const before = document.querySelector("title");
try {
  const dispose = hydrate(
    (() => document.documentElement) as never,
    document as never,
  );
  console.log("hydrate(document) report:", JSON.stringify(hydrate.report));
  dispose();
} catch (error) {
  console.log("hydrate(document) THREW:", String(error).slice(0, 200));
}
console.log("title node identity kept?", before === document.querySelector("title"));
