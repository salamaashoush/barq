import { computed } from "@barqjs/core";
import { renderToStream } from "./server.ts";
import { boundary as ssrBoundary, esc, html as ssrHtml, ssrLoading } from "./ssr.ts";

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(decoder.decode(value));
  }
  return parts;
}

// A FULL DOCUMENT with a boundary that settles after the shell — exactly what a
// shellComponent produces.
{
  const late = computed(async () => {
    await tick(5);
    return "LATE";
  });
  const page = (): unknown =>
    ssrHtml(
      `<html><head><title>t</title></head><body><main>${String(
        ssrLoading(null as never, {
          fallback: () => ssrHtml("<i>skeleton</i>"),
          children: () => ssrHtml(`<b>${esc(late())}</b>`),
        }),
      )}</main></body></html>`,
    );
  const parts = await collect(renderToStream(page as never, {}));
  console.log("=== chunks:", parts.length);
  parts.forEach((p, i) => console.log(`  [${i}] ${p.slice(0, 120).replace(/\n/g, " ")}`));
  const all = parts.join("");
  const closeHtml = all.indexOf("</html>");
  const template = all.indexOf("<template");
  console.log("</html> at", closeHtml, "| first <template> at", template);
  console.log("LATE CONTENT AFTER </html>?", template > closeHtml && closeHtml !== -1);
}
