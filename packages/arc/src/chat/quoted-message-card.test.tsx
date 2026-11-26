import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates } from "../test-arc.ts";
import { QuotedMessageCard } from "./quoted-message-card.tsx";

const ANA = { name: "Ana Lima" };
const AT = "2026-11-20T09:30:00Z";

describe("QuotedMessageCard", () => {
  test("an article named by its author: time, source, the message cut short, a note and a footer", async () => {
    render(() => (
      <QuotedMessageCard
        author={ANA}
        sentAt={AT}
        timeZone="UTC"
        source={{ label: "#design", href: "/c/design" }}
        note="Reply after the review"
        footer="Pinned by Salama"
      >
        The new tokens are in; check the dark theme before Friday.
      </QuotedMessageCard>
    ));
    const card = screen.getByRole("article", { name: "Ana Lima" });
    expect(screen.getByRole("link", { name: "#design" }).getAttribute("href")).toBe("/c/design");
    expect(card.querySelector('[data-slot="quoted-message-snippet"]')?.textContent).toContain(
      "The new tokens are in",
    );
    expect(card.querySelector("blockquote")?.textContent).toBe("Reply after the review");
    expect(card.querySelector('[data-slot="quoted-message-footer"]')?.textContent).toBe(
      "Pinned by Salama",
    );
    expect(card.querySelector("time")?.getAttribute("datetime")).toContain("2026-11-20");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the whole card opens the message, while the source and the actions stay their own", async () => {
    let opened = 0;
    let removed = 0;
    render(() => (
      <>
        <QuotedMessageCard
          author={ANA}
          sentAt={AT}
          onOpen={() => opened++}
          openLabel="Open Ana's message"
          actions={
            <button type="button" onClick={() => removed++}>
              Remove
            </button>
          }
        >
          Hello
        </QuotedMessageCard>
        <QuotedMessageCard author={{ name: "Ben" }} sentAt={AT} href="/m/2">
          Hi
        </QuotedMessageCard>
      </>
    ));
    await user.click(screen.getByRole("button", { name: "Open Ana's message" }));
    expect(opened).toBe(1);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(removed).toBe(1);
    expect(opened).toBe(1);
    expect(screen.getByRole("link", { name: "Ben" }).getAttribute("href")).toBe("/m/2");
  });

  test("shapes while the message loads; right to left, its classes reach their parts", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <QuotedMessageCard
          author={{ name: "سلامة" }}
          sentAt={AT}
          loading
          class="mine"
          classes={{ name: "n" }}
        />
      </Arabic>
    ));
    const card = document.querySelector('[data-slot="quoted-message-card"]');
    expect(card?.getAttribute("aria-busy")).toBe("true");
    expect(card?.querySelector('[data-slot="quoted-message-snippet"]')).toBeNull();
    expect(card?.classList.contains("mine")).toBe(true);
    expect(card?.querySelector('[data-slot="quoted-message-name"]')?.classList.contains("n")).toBe(
      true,
    );
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { QuotedMessageCard } from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
      export function Page() {
        return (
          <QuotedMessageCard author={{ name: "Ana" }} sentAt="2026-11-20T09:30:00Z" timeZone="UTC"
            source={{ label: "#design" }} href="/m/1" footer="Saved">Hello</QuotedMessageCard>
        );
      }
    `);
    expect(result.container.textContent).toContain("Hello");
    result.unmount();
  });
});
