import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { CalendarFeed, webcalUrl } from "./calendar-feed.tsx";
import { ConfirmHost } from "./confirm.tsx";

const FEED = "https://acme.example.com/feeds/oncall/abc123.ics";

describe("CalendarFeed", () => {
  test("the address to copy, and a button per calendar app that opens it", async () => {
    render(() => <CalendarFeed url={FEED} name="Acme on-call" />);
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Calendar link" });
    expect(input.value).toBe(FEED);
    expect(input.readOnly).toBe(true);
    expect(input.getAttribute("dir")).toBe("ltr");
    expect(screen.getByRole("button", { name: "Copy the calendar link" })).toBeDefined();
    const apps = screen.getByRole("group", { name: "Add to a calendar" });
    const links = [...apps.querySelectorAll("a")];
    expect(links.map((link) => link.textContent)).toEqual([
      "Google Calendar",
      "Apple Calendar",
      "Outlook",
    ]);
    expect(links[0]?.getAttribute("href")).toBe(
      `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl(FEED))}`,
    );
    expect(links[1]?.getAttribute("href")).toBe(
      "webcal://acme.example.com/feeds/oncall/abc123.ics",
    );
    expect(links[2]?.getAttribute("href")).toContain("addfromweb?url=https%3A%2F%2Facme");
    expect(links[2]?.getAttribute("href")).toContain("&name=Acme%20on-call");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("with none yet, makes one and shows it once", async () => {
    render(() => <CalendarFeed shownOnce onReset={() => Promise.resolve(FEED)} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    const make = screen.getByRole("button", { name: "Make a calendar link" });
    make.focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Calendar link" }).value).toBe(
        FEED,
      ),
    );
    expect(document.querySelector('[data-slot="calendar-feed-once"]')?.textContent).toContain(
      "shown this once",
    );
  });

  test("a feed made before names when, and a new one asks first since the old stops", async () => {
    const made: number[] = [];
    render(() => (
      <>
        <ConfirmHost />
        <CalendarFeed
          shownOnce
          existing={{ createdAt: "2026-11-02T09:00:00Z", lastReadAt: null }}
          onReset={() => {
            made.push(1);
            return Promise.resolve(`${FEED}?v=2`);
          }}
        />
      </>
    ));
    const existing = document.querySelector('[data-slot="calendar-feed-existing"]');
    expect(existing?.querySelectorAll("dt")[0]?.textContent).toBe("Link made");
    expect(existing?.querySelectorAll("dd")[1]?.textContent).toBe("Not yet");
    user.tap(screen.getByRole("button", { name: "Make a new link" }));
    await settle();
    const ask = await waitFor(() => screen.getByRole("alertdialog"));
    expect(ask.textContent).toContain("The current link stops working");
    expect(made).toEqual([]);
    await user.click(within(ask).getByRole("button", { name: "Make a new link" }));
    await waitFor(() => expect(made).toEqual([1]));
    await waitFor(() =>
      expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Calendar link" }).value).toBe(
        `${FEED}?v=2`,
      ),
    );
  });

  test("a make that fails says why", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <CalendarFeed onReset={() => Promise.reject(new Error("feeds are switched off"))} />
      </Rtl>
    ));
    await user.click(screen.getByRole("button", { name: "Make a calendar link" }));
    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert.textContent).toBe("Feeds are switched off.");
  });

  test("a server's feed is hydrated in place", async () => {
    const result = await hydrates(`
      import { CalendarFeed } from "<arc>";
      export function Page() {
        return <CalendarFeed url="https://acme.example.com/f.ics" />;
      }
    `);
    expect(result.container.textContent).toContain("Google Calendar");
    result.unmount();
  });
});
