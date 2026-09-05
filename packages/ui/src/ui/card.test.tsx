import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card.tsx";

function slot(name: string): HTMLElement {
  const found = document.querySelector(`[data-slot="${name}"]`);
  if (found === null) throw new Error(`no [data-slot="${name}"]`);
  return found as HTMLElement;
}

describe("Card", () => {
  test("every part is reachable by its slot", () => {
    render(() => (
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Everything billed this year.</CardDescription>
          <CardAction>New</CardAction>
        </CardHeader>
        <CardContent>Twelve</CardContent>
        <CardFooter>Paid</CardFooter>
      </Card>
    ));

    for (const name of [
      "card",
      "card-header",
      "card-title",
      "card-description",
      "card-action",
      "card-content",
      "card-footer",
    ]) {
      expect(slot(name)).toBeTruthy();
    }
    expect(slot("card-title").textContent).toBe("Invoices");
  });

  test("bordered adds a class the plain header does not have", () => {
    const { container } = render(() => (
      <>
        <CardHeader data-testid="plain">a</CardHeader>
        <CardHeader bordered data-testid="ruled">
          b
        </CardHeader>
      </>
    ));
    const classes = (testid: string): string[] =>
      (container.querySelector(`[data-testid="${testid}"]`)?.className ?? "").split(" ");
    const plain = classes("plain");
    const ruled = classes("ruled");
    // Atoms, so "a class" is one declaration: bordered adds the four the
    // border needs and keeps every one the plain header already had.
    expect(ruled.length).toBeGreaterThan(plain.length);
    for (const one of plain) expect(ruled).toContain(one);
  });

  // The eight styles select on both of these and the card wrote neither:
  // `[--card-spacing:--spacing(4)]` hangs off `data-[size=sm]`, and a bordered
  // edge's padding off the literal `.border-b` / `.border-t`. Nothing failed
  // without them — the card simply kept the large spacing under every style,
  // and a bordered header had a rule and no padding to go with it.
  test("carries the hooks the styles select on", () => {
    render(() => (
      <Card size="sm">
        <CardHeader bordered>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardFooter bordered>Paid</CardFooter>
      </Card>
    ));

    expect(slot("card").getAttribute("data-size")).toBe("sm");
    expect(slot("card-header").className.split(" ")).toContain("border-b");
    expect(slot("card-footer").className.split(" ")).toContain("border-t");
  });

  test("a card is default-sized unless it is told otherwise", () => {
    render(() => <Card>a</Card>);
    expect(slot("card").getAttribute("data-size")).toBe("default");
  });

  test("an unbordered edge carries no border marker", () => {
    render(() => <CardHeader>a</CardHeader>);
    expect(slot("card-header").className.split(" ")).not.toContain("border-b");
  });

  test("a caller's class comes after the component's own", () => {
    const { container } = render(() => <Card class="mine">a</Card>);
    const classes = container.querySelector('[data-slot="card"]')!.className.split(" ");
    expect(classes.at(-1)).toBe("mine");
    expect(classes.filter((name) => name === "mine")).toHaveLength(1);
  });

  test("a role, a label and a click all reach the element", async () => {
    const clicks: string[] = [];
    render(() => (
      <Card role="group" aria-label="Billing" onClick={() => clicks.push("hit")}>
        a
      </Card>
    ));
    const card = screen.getByRole("group", { name: "Billing" });
    card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicks).toEqual(["hit"]);
  });

  test("the component's slot is a default a caller can rename", () => {
    // `uiProps` merged its own `data-slot` LAST, so the caller's never reached
    // the element and a composed component could not be selected by its name.
    render(() => <Card data-slot="field">a</Card>);
    expect(slot("field")).toBeTruthy();
    expect(document.querySelector('[data-slot="card"]')).toBeNull();
  });

  // `filterDOMProps` allows the LABELLING aria and nothing else, which is right
  // for a `<div>` and wrong for one that is also a control. A sidebar menu
  // button driving a disclosure had its `aria-expanded` dropped in silence, so
  // the row announced nothing about the submenu it opens.
  test("the ARIA a control carries reaches the element", () => {
    render(() => (
      <Card aria-expanded aria-controls="panel" aria-current="page" role="button">
        a
      </Card>
    ));
    const card = slot("card");
    expect(card.getAttribute("aria-expanded")).toBe("true");
    expect(card.getAttribute("aria-controls")).toBe("panel");
    expect(card.getAttribute("aria-current")).toBe("page");
  });

  test("a prop that is not a DOM attribute does not become one", () => {
    render(() => <CardHeader bordered>a</CardHeader>);
    expect(slot("card-header").hasAttribute("bordered")).toBe(false);
  });
});
