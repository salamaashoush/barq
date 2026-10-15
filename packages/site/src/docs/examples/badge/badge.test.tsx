import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import BadgeCustomColors from "./badge-colors.tsx";
import BadgeWithIconLeft from "./badge-icon.tsx";
import BadgeAsLink from "./badge-link.tsx";
import BadgeRtl from "./badge-rtl.tsx";
import BadgeWithSpinner from "./badge-spinner.tsx";
import BadgeVariants from "./badge-variants.tsx";

const badges = (): readonly Element[] => [...document.querySelectorAll('[data-slot="badge"]')];

describe("the badge examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("badge")).toEqual([]);
  });

  test("each variant is written as an attribute", () => {
    render(() => <BadgeVariants />);
    expect(badges().map((badge) => badge.getAttribute("data-variant"))).toEqual([
      "default",
      "secondary",
      "destructive",
      "outline",
      "ghost",
    ]);
  });

  test("an icon says which side of the text it is on", () => {
    render(() => <BadgeWithIconLeft />);
    const [verified, bookmark] = badges();
    expect(verified?.firstElementChild?.getAttribute("data-icon")).toBe("inline-start");
    expect(bookmark?.lastElementChild?.getAttribute("data-icon")).toBe("inline-end");
  });

  test("a spinner sits before the text in one badge and after it in the other", () => {
    render(() => <BadgeWithSpinner />);
    const [deleting, generating] = badges();
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(deleting?.firstElementChild?.getAttribute("data-slot")).toBe("spinner");
    expect(deleting?.textContent?.trim()).toBe("Deleting");
    expect(generating?.lastElementChild?.getAttribute("data-slot")).toBe("spinner");
    expect(generating?.textContent?.trim()).toBe("Generating");
  });

  test("a badge with an href is the link itself", () => {
    render(() => <BadgeAsLink />);
    const link = screen.getByRole("link", { name: "Open Link" });
    expect(link.getAttribute("data-slot")).toBe("badge");
    expect(link.getAttribute("href")).toBe("#link");
  });

  test("the five coloured badges each carry a class of their own", () => {
    render(() => <BadgeCustomColors />);
    const classes = badges().map((badge) => badge.getAttribute("class"));
    expect(classes).toHaveLength(5);
    expect(new Set(classes).size).toBe(5);
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <BadgeRtl />);
    expect(document.querySelectorAll('[dir="rtl"] [data-slot="badge"]')).toHaveLength(6);
  });
});
