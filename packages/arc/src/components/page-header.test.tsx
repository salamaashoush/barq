import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, within } from "@barqjs/testing";
import { srOnly } from "@barqjs/ui/sr-only";

import { hydrates } from "../test-arc.ts";

import { PageHeader } from "./page-header.tsx";

describe("PageHeader", () => {
  test("makes the heading the page's h1, with what is given beside it", () => {
    render(() => (
      <PageHeader
        heading="Checks"
        description="Everything this project watches."
        leading={<a href="/">Back</a>}
        actions={<button type="button">New check</button>}
      />
    ));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Checks");
    expect(screen.getByText("Everything this project watches.").tagName).toBe("P");
    expect(screen.getByRole("button", { name: "New check" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Back" })).toBeDefined();
  });

  test("leaves out what is not given", () => {
    render(() => <PageHeader heading="Plain" />);
    expect(document.querySelector('[data-slot="page-header-description"]')).toBeNull();
    expect(document.querySelector('[data-slot="page-header-actions"]')).toBeNull();
  });
});

describe("PageHeader as a record's header", () => {
  test("puts the mark before the title, badges after it, and facts named only for a screen reader", async () => {
    render(() => (
      <PageHeader
        heading="Checkout API"
        media={<img alt="" src="data:," />}
        mark={<span aria-label="Failing">●</span>}
        badges={<span>HTTP</span>}
        facts={[
          { label: "Target", value: "api.example.com" },
          { label: "Schedule", value: "Every minute" },
        ]}
        alerts={[
          { label: "Alerts muted until 14:00", icon: <svg /> },
          { label: "Incident open", tone: "danger" },
        ]}
        actions={<button type="button">Run now</button>}
      />
    ));
    const row = document.querySelector('[data-slot="page-header-title-row"]') as HTMLElement;
    expect([...row.children].map((one) => one.getAttribute("data-slot"))).toEqual([
      "page-header-mark",
      "page-header-title",
      "page-header-badges",
    ]);
    const facts = document.querySelector('[data-slot="page-header-facts"]') as HTMLElement;
    expect(facts.tagName).toBe("DL");
    expect([...facts.querySelectorAll("dt")].map((one) => one.textContent)).toEqual([
      "Target",
      "Schedule",
    ]);
    expect(facts.querySelector("dt")?.className).toBe(srOnly);
    const alerts = screen.getByRole("list");
    expect(
      within(alerts)
        .getAllByRole("listitem")
        .map((one) => one.textContent),
    ).toEqual(["Alerts muted until 14:00", "Incident open"]);
    expect(alerts.querySelector('[data-slot="chip"]')?.className.split(" ").length).toBeGreaterThan(
      1,
    );
    expect(document.querySelector('[data-slot="page-header-media"] img')).not.toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("draws no record parts it was not given, and an empty facts list draws nothing", () => {
    render(() => <PageHeader heading="Plain" facts={[]} alerts={[]} />);
    for (const slot of ["media", "mark", "badges", "facts", "alerts"]) {
      expect(document.querySelector(`[data-slot="page-header-${slot}"]`)).toBeNull();
    }
  });

  test("keeps a long title and a long alert inside a narrow page", () => {
    const long = "A very long record name that does not fit on one line of a phone ".repeat(3);
    render(() => (
      <PageHeader heading={long} alerts={[{ label: long }]} classes={{ title: "own-title" }} />
    ));
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.classList.contains("own-title")).toBe(true);
    expect(title.textContent).toBe(long);
    const label = document.querySelector(
      '[data-slot="page-header-alert"] [data-slot="chip-label"]',
    );
    expect(label?.textContent).toBe(long);
  });

  test("lays out in a right-to-left page by the same logical parts", () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <PageHeader
          heading="الفاتورة"
          mark={<span>●</span>}
          facts={[{ label: "العميل", value: "أكمي" }]}
        />
      </Rtl>
    ));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("الفاتورة");
    expect(document.querySelector('[data-slot="page-header-fact"] dd')?.textContent).toBe("أكمي");
  });

  test("a server's record header is hydrated in place", async () => {
    const result = await hydrates(`
      import { PageHeader } from "<arc>";
      export function Page() {
        return (
          <PageHeader
            heading="INV-0042"
            mark={<span>●</span>}
            badges={<span>Paid</span>}
            facts={[{ label: "Customer", value: "Acme" }, { label: "Due", value: "3 March" }]}
            alerts={[{ label: "Overdue", tone: "danger" }]}
            actions={<button type="button">Send</button>}
          />
        );
      }
    `);
    expect(result.container.querySelectorAll("dt").length).toBe(2);
    result.unmount();
  });
});
