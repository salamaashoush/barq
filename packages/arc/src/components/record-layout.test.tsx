import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { DescriptionList } from "./description-list.tsx";
import { provideArcMessages } from "./messages.ts";
import { RecordLayout, RecordSection, recordLayoutStyles } from "./record-layout.tsx";

function slot(name: string): HTMLElement | null {
  return document.querySelector(`[data-slot="${name}"]`);
}

describe("RecordLayout", () => {
  test("puts the story in the main column and the facts in a named rail after it", async () => {
    render(() => (
      <RecordLayout
        rail={
          <RecordSection heading="Details">
            <DescriptionList items={[{ term: "Owner", details: "Salama" }]} />
          </RecordSection>
        }
      >
        <RecordSection heading="Lines">
          <p>Two lines.</p>
        </RecordSection>
      </RecordLayout>
    ));
    const rail = screen.getByRole("complementary", { name: "Details" });
    const main = slot("record-layout-main") as HTMLElement;
    expect(main.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(main).getByRole("region", { name: "Lines" })).toBeDefined();
    expect(within(rail).getByRole("region", { name: "Details" })).toBeDefined();
    expect(slot("record-layout")?.getAttribute("data-rail")).toBe("narrow");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("leaves the rail out when it has nothing, and names it in the reader's words", () => {
    render(() => (
      <>
        <RecordLayout>
          <p>Only a story.</p>
        </RecordLayout>
        <RecordLayout railLabel="Facts" railWidth="third" stickyRail rail={<p>Rail</p>} />
      </>
    ));
    const [bare, ruled] = [...document.querySelectorAll('[data-slot="record-layout"]')];
    expect(bare?.querySelector("aside")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Facts" })).toBeDefined();
    expect(ruled?.getAttribute("data-rail")).toBe("third");
    expect(bare?.className).not.toBe(ruled?.className);
    expect(recordLayoutStyles({ sticky: true }).rail).not.toBe(recordLayoutStyles().rail);
  });

  test("names the rail in another language from the provider", () => {
    function German(props: ParentProps) {
      provideArcMessages(() => ({ details: "Einzelheiten" }));
      return <>{props.children}</>;
    }
    render(() => (
      <German>
        <RecordLayout rail={<p>Rail</p>} />
      </German>
    ));
    expect(screen.getByRole("complementary", { name: "Einzelheiten" })).toBeDefined();
  });
});

describe("RecordSection", () => {
  test("an Edit button named for what it changes, beside the section's own actions", async () => {
    const edits: string[] = [];
    render(() => (
      <RecordSection
        heading="Contact"
        description="How the school reaches the family."
        actions={<button type="button">Call</button>}
        onEdit={() => edits.push("contact")}
        editLabel="Edit the contact details"
      >
        <p>Salama, +20 100 000 0000</p>
      </RecordSection>
    ));
    await settle();
    const section = screen.getByRole("region", { name: "Contact" });
    const buttons = within(section).getAllByRole("button");
    expect(buttons.map((one) => one.getAttribute("aria-label") ?? one.textContent)).toEqual([
      "Call",
      "Edit the contact details",
    ]);
    expect(buttons[1]?.textContent).toBe("Edit");
    await user.click(buttons[1] as HTMLElement);
    expect(edits).toEqual(["contact"]);
    await user.keyboard("{Enter}");
    expect(edits).toEqual(["contact", "contact"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("with nothing to do there is no actions part, and each look has its own classes", () => {
    render(() => (
      <>
        <RecordSection heading="Card" id="card" />
        <RecordSection heading="Ruled" variant="ruled" />
        <RecordSection heading="Plain" variant="plain" />
      </>
    ));
    expect(slot("panel-toolbar-actions")).toBeNull();
    expect(screen.getByRole("heading", { name: "Card" }).id).toBe("card-heading");
    const looks = [...document.querySelectorAll('[data-slot="record-section"]')];
    expect(looks.map((one) => one.getAttribute("data-variant"))).toEqual([
      "card",
      "ruled",
      "plain",
    ]);
    expect(new Set(looks.map((one) => one.className)).size).toBe(3);
  });

  test("reads in a right-to-left page with the edit button at the end", () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <RecordSection heading="العنوان" onEdit={() => {}}>
          <p>القاهرة</p>
        </RecordSection>
      </Rtl>
    ));
    const header = slot("record-section-header") as HTMLElement;
    expect(header.lastElementChild?.getAttribute("data-slot")).toBe("panel-toolbar-actions");
  });

  test("a server's record page is hydrated in place", async () => {
    const result = await hydrates(`
      import { RecordLayout, RecordSection, DescriptionList } from "<arc>";
      export function Page() {
        return (
          <RecordLayout rail={<RecordSection heading="Details" id="details"><DescriptionList items={[{ term: "Owner", details: "Salama" }]} /></RecordSection>}>
            <RecordSection heading="Lines" onEdit={() => {}}><p>Two lines.</p></RecordSection>
          </RecordLayout>
        );
      }
    `);
    expect(result.container.querySelectorAll("section").length).toBe(2);
    result.unmount();
  });
});
