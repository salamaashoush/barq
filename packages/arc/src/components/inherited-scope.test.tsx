import { describe, expect, test } from "bun:test";
import type { ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, within } from "@barqjs/testing";

import { hydrates } from "../test-arc.ts";
import { InheritedScopeList } from "./inherited-scope.tsx";

describe("InheritedScopeList", () => {
  test("the scope's own items, then each inherited list as a named section linking to its owner", async () => {
    render(() => (
      <InheritedScopeList
        ownHeading="This project"
        own={
          <ul aria-label="Project routes">
            <li>Page the web team</li>
          </ul>
        }
        inherited={[
          {
            id: "org",
            owner: "Acme organization",
            href: "/acme/alerts",
            content: (
              <ul aria-label="Organization routes">
                <li>Email ops</li>
              </ul>
            ),
          },
          { id: "team", owner: "Platform team", content: null, isEmpty: true },
        ]}
        note="Incidents no route covers go to the project's owners."
      />
    ));
    const own = screen.getByRole("region", { name: "This project" });
    expect(within(own).getByRole("list", { name: "Project routes" })).toBeDefined();
    const org = screen.getByRole("region", { name: "From Acme organization" });
    expect(within(org).getByRole("heading", { level: 3 }).textContent).toBe(
      "From Acme organization",
    );
    expect(within(org).getByRole("link", { name: "Acme organization" }).getAttribute("href")).toBe(
      "/acme/alerts",
    );
    expect(within(org).getByText(/Read only here/)).toBeDefined();
    const team = screen.getByRole("region", { name: "From Platform team" });
    expect(within(team).getByText("None.")).toBeDefined();
    expect(within(team).queryByRole("link")).toBeNull();
    expect(screen.getByText("Incidents no route covers go to the project's owners.")).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("takes a heading level", () => {
    render(() => (
      <InheritedScopeList
        own={<p>own</p>}
        headingLevel={2}
        inherited={[{ id: "org", owner: "Acme", content: <p>x</p> }]}
      />
    ));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("From Acme");
  });

  test("runs right to left", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <InheritedScopeList
          own={<p>own</p>}
          inherited={[{ id: "o", owner: "أكمي", content: <p>x</p> }]}
        />
      </Arabic>
    ));
    expect(screen.getByRole("region", { name: "From أكمي" })).toBeDefined();
  });

  test("takes a class per part", () => {
    render(() => (
      <InheritedScopeList
        class="mine"
        classes={{ root: "r", own: "o", scope: "s", heading: "h", empty: "e", note: "n" }}
        own={<p>own</p>}
        inherited={[{ id: "o", owner: "Acme", content: null, isEmpty: true }]}
        note="note"
      />
    ));
    for (const [slot, cls] of [
      ["inherited-scope-list", "r"],
      ["inherited-scope-own", "o"],
      ["inherited-scope", "s"],
      ["inherited-scope-heading", "h"],
      ["inherited-scope-empty", "e"],
      ["inherited-scope-note", "n"],
    ] as const) {
      expect(document.querySelector(`[data-slot="${slot}"]`)?.classList.contains(cls)).toBe(true);
    }
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { InheritedScopeList } from "<arc>";
      export function Page() {
        return (
          <InheritedScopeList
            own={<p>Own</p>}
            inherited={[{ id: "org", owner: "Acme", href: "/acme", content: <p>Theirs</p> }]}
            note="Fallback"
          />
        );
      }
    `);
    expect(result.container.textContent).toContain("From Acme");
    result.unmount();
  });
});
