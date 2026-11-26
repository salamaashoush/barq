import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { ProfileCard } from "./profile-card.tsx";

const SALAMA = { name: "Salama Ashoush" };

function slot(name: string): HTMLElement | null {
  return document.querySelector(`[data-slot="${name}"]`);
}

describe("ProfileCard", () => {
  test("a region named by the person: their name, title, presence, status, actions and contacts", async () => {
    render(() => (
      <ProfileCard
        person={SALAMA}
        title="Engineering"
        presence="away"
        status={{ emoji: "🌴", text: "On leave" }}
        actions={<button type="button">Message</button>}
        contacts={[
          {
            key: "email",
            label: "Email",
            value: "salama@example.com",
            href: "mailto:salama@example.com",
          },
          { key: "phone", label: "Phone", value: "+20 100 000 0000" },
        ]}
        about="Builds the design system."
      />
    ));
    const region = screen.getByRole("region", { name: "Salama Ashoush" });
    expect(screen.getByRole("heading", { level: 2, name: "Salama Ashoush" })).toBeDefined();
    expect(slot("profile-card-title")?.textContent).toBe("Engineering");
    expect(region.querySelector('[data-slot="presence-status"]')?.textContent).toContain("Away");
    expect(region.querySelector('[data-slot="presence-status-text"]')?.textContent).toBe(
      "On leave",
    );
    expect(region.querySelector('[data-slot="presence-dot"][data-presence="away"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Message" })).toBeDefined();
    const contacts = screen.getByRole("list", { name: "Contact details" });
    expect(contacts.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "salama@example.com" }).getAttribute("href")).toBe(
      "mailto:salama@example.com",
    );
    expect(screen.getByRole("heading", { level: 3, name: "About" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("writes the time where they are, for the given moment before hydration and the clock's after", async () => {
    render(() => (
      <ProfileCard person={SALAMA} timeZone="Africa/Cairo" now="2026-11-26T10:00:00Z" />
    ));
    await settle();
    const time = slot("profile-card-time");
    expect(time?.textContent).toContain("Local time");
    expect(time?.textContent).toContain("Africa/Cairo");
    expect(time?.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  test("shapes while loading, and words when nobody is found", () => {
    render(() => (
      <>
        <ProfileCard person={SALAMA} loading />
        <ProfileCard person={SALAMA} missing />
      </>
    ));
    const [loading, missing] = [...document.querySelectorAll('[data-slot="profile-card"]')];
    expect(loading?.getAttribute("aria-busy")).toBe("true");
    expect(loading?.querySelector('[data-slot="profile-card-name"]')).toBeNull();
    expect(missing?.textContent).toBe("This person could not be found.");
  });

  test("a panel centres a larger avatar; right to left it reads in its own direction", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <ProfileCard
          person={{ name: "سلامة" }}
          variant="panel"
          presence="online"
          class="mine"
          classes={{ name: "n" }}
          renders={{ name: (part, words) => <h3 {...part.props}>{words}</h3> }}
        />
      </Arabic>
    ));
    const card = slot("profile-card");
    expect(card?.getAttribute("data-variant")).toBe("panel");
    expect(card?.classList.contains("mine")).toBe(true);
    expect(slot("profile-card-name")?.tagName).toBe("H3");
    expect(slot("profile-card-name")?.classList.contains("n")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { ProfileCard } from "<arc>";
      export function Page() {
        return (
          <ProfileCard person={{ name: "Ana Lima" }} presence="online" title="Design"
            timeZone="Europe/Lisbon" now="2026-11-26T10:00:00Z"
            contacts={[{ key: "e", label: "Email", value: "ana@example.com" }]} />
        );
      }
    `);
    expect(
      result.container.querySelector('[data-slot="profile-card-time"]')?.textContent,
    ).toContain("Europe/Lisbon");
    result.unmount();
  });
});
