import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates } from "../test-arc.ts";
import { LinkPreview, hostOf } from "./link-preview.tsx";

const URL_ = "https://www.example.com/posts/shipping-arc";

describe("LinkPreview", () => {
  test("the title is one link over the card that says it opens a new tab; the site and picture are decorative", async () => {
    render(() => (
      <LinkPreview
        url={URL_}
        title="Shipping arc"
        description="What changed in the design system this month."
        image="/card.png"
      />
    ));
    const link = screen.getByRole("link", { name: "Shipping arc (opens in a new tab)" });
    expect(link.getAttribute("href")).toBe(URL_);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(document.querySelector('[data-slot="link-preview-site"]')?.textContent).toBe(
      "example.com",
    );
    expect(
      document.querySelector('[data-slot="link-preview-media"] img')?.getAttribute("alt"),
    ).toBe("");
    expect(screen.getByText("What changed in the design system this month.")).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a remove button of its own, and the address as the link's words without a title", async () => {
    let removed = 0;
    render(() => (
      <LinkPreview
        url={URL_}
        siteName="Example"
        newTab={false}
        onDismiss={() => removed++}
        layout="stacked"
      />
    ));
    expect(screen.getByRole("link", { name: URL_ }).hasAttribute("target")).toBe(false);
    expect(document.querySelector('[data-slot="link-preview-site"]')?.textContent).toBe("Example");
    await user.click(screen.getByRole("button", { name: "Remove preview" }));
    expect(removed).toBe(1);
  });

  test("shapes while it is fetched, the address still a link", () => {
    render(() => <LinkPreview url={URL_} loading />);
    expect(document.querySelector('[data-slot="link-preview"]')?.getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: URL_ })).toBeDefined();
    expect(document.querySelector('[data-slot="link-preview-title"]')).toBeNull();
  });

  test("reads a host from an address, or keeps what does not parse", () => {
    expect(hostOf("https://docs.example.com/a")).toBe("docs.example.com");
    expect(hostOf("not a url")).toBe("not a url");
  });

  test("right to left, it takes its classes and the locale's words", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <LinkPreview url={URL_} title="عنوان" class="mine" classes={{ title: "t" }} />
      </Arabic>
    ));
    expect(document.querySelector('[data-slot="link-preview"]')?.classList.contains("mine")).toBe(
      true,
    );
    expect(
      document.querySelector('[data-slot="link-preview-title"]')?.classList.contains("t"),
    ).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { LinkPreview } from "<arc>";
      export function Page() {
        return <LinkPreview url="https://example.com" title="Example" onDismiss={() => {}} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="link-preview-link"]')).not.toBeNull();
    result.unmount();
  });
});
