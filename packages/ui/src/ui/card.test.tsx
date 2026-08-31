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
    expect(ruled.length).toBe(plain.length + 1);
    for (const one of plain) expect(ruled).toContain(one);
  });

  test("a caller's class comes after the component's own", () => {
    const { container } = render(() => <Card class="mine">a</Card>);
    const classes = container.querySelector('[data-slot="card"]')!.className.split(" ");
    expect(classes.at(-1)).toBe("mine");
    expect(classes).toHaveLength(2);
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

  test("a prop that is not a DOM attribute does not become one", () => {
    render(() => <CardHeader bordered>a</CardHeader>);
    expect(slot("card-header").hasAttribute("bordered")).toBe(false);
  });
});
