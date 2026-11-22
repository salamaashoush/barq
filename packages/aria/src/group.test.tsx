import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { Group } from "./group.tsx";

describe("Group", () => {
  test("is a group by default", () => {
    render(() => <Group aria-label="Quantity">salama</Group>);

    const group = screen.getByRole("group");
    expect(accessibleName(group)).toBe("Quantity");
    expect(group.textContent).toBe("salama");
    expectNoAriaViolations(document.body);
  });

  test("can be a region or presentation", () => {
    render(() => (
      <>
        <Group role="region" aria-label="Filters" />
        <Group role="presentation" data-testid="drawn" />
      </>
    ));

    expect(accessibleName(screen.getByRole("region"))).toBe("Filters");
    expect(screen.getByTestId("drawn").getAttribute("role")).toBe("presentation");
  });

  test("forwards class, style, data and global attributes", () => {
    render(() => (
      <Group class="acme" style={{ color: "red" }} data-foo="bar" dir="rtl" id="g">
        x
      </Group>
    ));

    const group = screen.getByRole("group");
    expect(group.getAttribute("class")).toBe("acme");
    expect(group.style.color).toBe("red");
    expect(group.getAttribute("data-foo")).toBe("bar");
    expect(group.getAttribute("dir")).toBe("rtl");
    expect(group.id).toBe("g");
  });

  test("hover is reported on the element and through the callbacks", () => {
    const seen: string[] = [];
    render(() => (
      <Group
        onHoverStart={() => seen.push("start")}
        onHoverEnd={() => seen.push("end")}
        onHoverChange={(over) => seen.push(`change ${over}`)}
      >
        x
      </Group>
    ));
    const group = screen.getByRole("group");
    expect(group.hasAttribute("data-hovered")).toBe(false);

    user.hover(group);
    flush();
    expect(group.hasAttribute("data-hovered")).toBe(true);

    user.unhover(group);
    flush();
    expect(group.hasAttribute("data-hovered")).toBe(false);
    expect(seen).toEqual(["start", "change true", "end", "change false"]);
  });

  test("a disabled group does not hover", () => {
    render(() => <Group isDisabled>x</Group>);
    const group = screen.getByRole("group");

    user.hover(group);
    flush();

    expect(group.hasAttribute("data-hovered")).toBe(false);
    expect(group.hasAttribute("data-disabled")).toBe(true);
  });

  test("keyboard focus inside shows the ring; leaving removes it", () => {
    render(() => (
      <>
        <Group>
          <input type="text" aria-label="Amount" />
        </Group>
        <button type="button">After</button>
      </>
    ));
    const group = screen.getByRole("group");

    user.tab();
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
    expect(group.hasAttribute("data-focus-within")).toBe(true);
    expect(group.hasAttribute("data-focus-visible")).toBe(true);

    user.tab();
    expect(group.hasAttribute("data-focus-within")).toBe(false);
    expect(group.hasAttribute("data-focus-visible")).toBe(false);
  });

  test("typing after a click inside does not show the ring", () => {
    render(() => (
      <Group>
        <input type="text" aria-label="Amount" />
      </Group>
    ));
    const group = screen.getByRole("group");
    const input = screen.getByRole<HTMLInputElement>("textbox");

    user.click(input);
    user.type(input, "a");
    flush();

    expect(input.value).toBe("a");
    expect(group.hasAttribute("data-focus-within")).toBe(true);
    expect(group.hasAttribute("data-focus-visible")).toBe(false);
  });

  test("disabled, invalid and read-only are data attributes", () => {
    const [invalid, setInvalid] = createSignal(false);
    render(() => (
      <Group isDisabled isReadOnly isInvalid={invalid()}>
        x
      </Group>
    ));
    const group = screen.getByRole("group");

    expect(group.hasAttribute("data-disabled")).toBe(true);
    expect(group.hasAttribute("data-readonly")).toBe(true);
    expect(group.hasAttribute("data-invalid")).toBe(false);

    setInvalid(true);
    flush();
    expect(group.hasAttribute("data-invalid")).toBe(true);
  });

  test("aria-disabled and aria-invalid stand in for the props", () => {
    render(() => (
      <Group aria-disabled="true" aria-invalid>
        x
      </Group>
    ));
    const group = screen.getByRole("group");

    expect(group.getAttribute("aria-disabled")).toBe("true");
    expect(group.hasAttribute("data-disabled")).toBe(true);
    expect(group.hasAttribute("data-invalid")).toBe(true);
  });

  test("the ref reaches the element", () => {
    let held: HTMLDivElement | null = null;
    render(() => (
      <Group
        ref={(element) => {
          held = element;
        }}
      >
        x
      </Group>
    ));
    expect(held === screen.getByRole("group")).toBe(true);
  });
});
