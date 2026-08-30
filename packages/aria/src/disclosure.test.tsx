import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import type { Key } from "./collections.ts";
import {
  Disclosure,
  DisclosureButton,
  DisclosureGroup,
  DisclosureGroupItem,
  DisclosurePanel,
} from "./disclosure.tsx";

function Details(
  props: Incoming<{ defaultExpanded?: boolean; onExpandedChange?: (open: boolean) => void }>,
) {
  return (
    <Disclosure
      defaultExpanded={props.defaultExpanded?.()}
      onExpandedChange={props.onExpandedChange?.()}
    >
      <DisclosureButton>Details</DisclosureButton>
      <DisclosurePanel>Everything else</DisclosurePanel>
    </Disclosure>
  );
}

function trigger(): HTMLElement {
  return screen.getByRole("button", { name: "Details" });
}

/** `hidden: true`, because a collapsed panel is out of the tree — which is
    the thing several of these tests are about. */
function panel(): HTMLElement {
  return screen.getAllByRole("group", { hidden: true })[0] as HTMLElement;
}

describe("Disclosure", () => {
  test("the button says what it controls and whether it is open", () => {
    render(() => <Details />);

    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().getAttribute("aria-controls")).toBe(panel().id);
    expect(panel().getAttribute("aria-labelledby")).toBe(trigger().id);
  });

  test("the panel is searchable while it is shut, not removed", () => {
    render(() => <Details />);

    // `until-found`, so the browser's find-in-page reaches the text and can
    // open the disclosure itself.
    expect(panel().getAttribute("hidden")).toBe("until-found");
    expect(panel().textContent).toBe("Everything else");
  });

  test("pressing the button opens it", () => {
    const changes: boolean[] = [];
    render(() => <Details onExpandedChange={(open) => changes.push(open)} />);

    user.click(trigger());
    flush();

    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(panel().hasAttribute("hidden")).toBe(false);
    expect(changes).toEqual([true]);
  });

  test("pressing it again closes it", () => {
    render(() => <Details defaultExpanded />);

    expect(panel().hasAttribute("hidden")).toBe(false);

    user.click(trigger());
    flush();

    expect(panel().getAttribute("hidden")).toBe("until-found");
  });

  test("find-in-page opens it", () => {
    render(() => <Details />);

    // What the browser does: strips `hidden`, then fires `beforematch`.
    panel().removeAttribute("hidden");
    panel().dispatchEvent(new Event("beforematch", { bubbles: true }));
    flush();

    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(panel().hasAttribute("hidden")).toBe(false);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Details defaultExpanded />);
    expectNoAriaViolations(container);
  });
});

interface Section {
  id: string;
  name: string;
  body: string;
}

const SECTIONS: Section[] = [
  { id: "one", name: "One", body: "First" },
  { id: "two", name: "Two", body: "Second" },
  { id: "three", name: "Three", body: "Third" },
];

function Accordion(
  props: Incoming<{
    allowsMultiple?: boolean;
    defaultExpandedKeys?: Iterable<Key>;
    onExpandedChange?: (keys: Set<Key>) => void;
  }>,
) {
  return (
    <DisclosureGroup
      items={SECTIONS}
      allowsMultiple={props.allowsMultiple?.()}
      defaultExpandedKeys={props.defaultExpandedKeys?.()}
      onExpandedChange={props.onExpandedChange?.()}
    >
      {(section: Section) => (
        <DisclosureGroupItem>
          <DisclosureButton>{section.name}</DisclosureButton>
          <DisclosurePanel>{section.body}</DisclosurePanel>
        </DisclosureGroupItem>
      )}
    </DisclosureGroup>
  );
}

function expandedNames(): string[] {
  return screen
    .getAllByRole("button")
    .filter((element: Element) => element.getAttribute("aria-expanded") === "true")
    .map((element: Element) => element.textContent ?? "");
}

describe("DisclosureGroup", () => {
  test("every section has its own button and panel", () => {
    render(() => <Accordion />);

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getAllByRole("group", { hidden: true })).toHaveLength(3);
  });

  test("opening one closes the others", () => {
    render(() => <Accordion defaultExpandedKeys={["one"]} />);

    expect(expandedNames()).toEqual(["One"]);

    user.click(screen.getByRole("button", { name: "Two" }));
    flush();

    expect(expandedNames()).toEqual(["Two"]);
  });

  test("allowsMultiple keeps them all open", () => {
    const changes: string[][] = [];
    render(() => (
      <Accordion
        allowsMultiple
        defaultExpandedKeys={["one"]}
        onExpandedChange={(keys) => changes.push([...keys].map(String))}
      />
    ));

    user.click(screen.getByRole("button", { name: "Two" }));
    flush();

    expect(expandedNames()).toEqual(["One", "Two"]);
    expect(changes).toEqual([["one", "two"]]);
  });

  test("pressing an open section closes it", () => {
    render(() => <Accordion allowsMultiple defaultExpandedKeys={["one", "two"]} />);

    user.click(screen.getByRole("button", { name: "One" }));
    flush();

    expect(expandedNames()).toEqual(["Two"]);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Accordion defaultExpandedKeys={["two"]} />);
    expectNoAriaViolations(container);
  });
});
