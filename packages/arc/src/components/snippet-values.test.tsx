import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { render, screen, waitFor } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import {
  SnippetValue,
  SnippetValuesProvider,
  readerOrigin,
  useSnippetValues,
} from "./snippet-values.tsx";

const DEFAULTS = { origin: "https://acme.example.com", project: "storefront", token: "acme_..." };

function Command() {
  const values = useSnippetValues();
  return (
    <code data-testid="command">{`curl -H "Authorization: Bearer ${values().token ?? ""}" ${values().origin ?? ""}/api/${values().project ?? ""}`}</code>
  );
}

describe("SnippetValuesProvider", () => {
  test("shows the defaults, then the reader's own once the page is live", async () => {
    let asked = 0;
    render(() => (
      <SnippetValuesProvider
        defaults={DEFAULTS}
        resolve={() => {
          asked++;
          return Promise.resolve({ project: "checkout" });
        }}
      >
        <Command />
        <p>
          Your project is <SnippetValue name="project" />.
        </p>
      </SnippetValuesProvider>
    ));
    await waitFor(() => {
      flush();
      if (!screen.getByTestId("command").textContent?.includes("checkout"))
        throw new Error("not yet");
    });
    expect(asked).toBe(1);
    expect(screen.getByTestId("command").textContent).toBe(
      'curl -H "Authorization: Bearer acme_..." https://acme.example.com/api/checkout',
    );
    const value = document.querySelector('[data-slot="snippet-value"]');
    expect(value?.textContent).toBe("checkout");
    expect(value?.getAttribute("dir")).toBe("ltr");
  });

  test("a value known now wins, and readerOrigin answers the page's origin", async () => {
    const [token, setToken] = createSignal<string | undefined>(undefined);
    render(() => (
      <SnippetValuesProvider defaults={DEFAULTS} resolve={readerOrigin} values={{ token: token() }}>
        <Command />
      </SnippetValuesProvider>
    ));
    await settle();
    expect(screen.getByTestId("command").textContent).toContain(window.location.origin);
    setToken("acme_live_1234");
    flush();
    expect(screen.getByTestId("command").textContent).toContain("Bearer acme_live_1234");
  });

  test("a resolver that throws or answers nothing leaves the defaults, and an unmounted page aborts", async () => {
    let signal: AbortSignal | undefined;
    const { unmount } = render(() => (
      <div>
        <SnippetValuesProvider
          defaults={DEFAULTS}
          resolve={() => {
            throw new Error("offline");
          }}
        >
          <SnippetValue name="origin" />
        </SnippetValuesProvider>
        <SnippetValuesProvider
          defaults={DEFAULTS}
          resolve={(given) => {
            signal = given;
            return new Promise(() => {});
          }}
        >
          <SnippetValue name="missing" fallback="—" />
        </SnippetValuesProvider>
      </div>
    ));
    await settle();
    const values = [...document.querySelectorAll('[data-slot="snippet-value"]')].map(
      (one) => one.textContent,
    );
    expect(values).toEqual(["https://acme.example.com", "—"]);
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  test("is hydrated with the defaults, the reader's values after", async () => {
    const result = await hydrates(`
      import { SnippetValue, SnippetValuesProvider } from "<arc>";
      export function Page() {
        return (
          <SnippetValuesProvider defaults={{ origin: "https://acme.example.com" }} resolve={() => ({ origin: "https://reader.example.com" })}>
            <p><SnippetValue name="origin" /></p>
          </SnippetValuesProvider>
        );
      }
    `);
    await settle();
    expect(result.container.textContent).toBe("https://reader.example.com");
    result.unmount();
  });
});
