import { createRequestEvent, esc, html as markup, renderToString } from "@barqjs/server";
import { provideRequestEvent } from "@barqjs/server/storage";
import { colorScheme, useColorScheme } from "./color-scheme.ts";

interface ProbedPage {
  html: string;
  resolved: string | null;
  choice: string;
}

function page(cookie: string | null): ProbedPage {
  const headers = new Headers(cookie === null ? {} : { cookie });
  const event = createRequestEvent(new Request("http://localhost/", { headers }));
  let resolved: string | null = null;
  let choice = "";
  const html = provideRequestEvent(event, () =>
    renderToString(
      () => {
        colorScheme();
        const scheme = useColorScheme();
        resolved = scheme.resolved() ?? null;
        choice = scheme.choice();
        return markup(`<html><head></head><body>${esc(resolved ?? "unknown")}</body></html>`);
      },
      { nonce: "n0nce" },
    ),
  );
  return { html, resolved, choice };
}

console.log(JSON.stringify({ dark: page("a=1; theme=dark"), none: page(null) }));
