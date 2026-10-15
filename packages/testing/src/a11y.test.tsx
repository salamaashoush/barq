import { describe, expect, test } from "bun:test";

import { accessibleName, ariaViolations, render, role } from "./index.ts";

describe("the role of a `<section>`", () => {
  test("is generic without an accessible name", () => {
    const { container } = render(() => (
      <section>
        <p>Notifications</p>
      </section>
    ));
    const section = container.querySelector("section") as HTMLElement;
    expect(role(section)).toBe("generic");
    expect(accessibleName(section)).toBe("");
  });

  test("is a region when `aria-label` names it", () => {
    const { container } = render(() => <section aria-label="Notifications" />);
    const section = container.querySelector("section") as HTMLElement;
    expect(role(section)).toBe("region");
    expect(accessibleName(section)).toBe("Notifications");
  });

  test("is a region when `aria-labelledby` names it", () => {
    const { container } = render(() => (
      <section aria-labelledby="inbox-heading">
        <h2 id="inbox-heading">Inbox</h2>
      </section>
    ));
    const section = container.querySelector("section") as HTMLElement;
    expect(role(section)).toBe("region");
    expect(accessibleName(section)).toBe("Inbox");
  });

  test("is a region when `title` names it", () => {
    const { container } = render(() => <section title="Activity" />);
    expect(role(container.querySelector("section") as HTMLElement)).toBe("region");
  });

  test("is generic when `aria-labelledby` points at nothing with text", () => {
    const { container } = render(() => (
      <section aria-labelledby="missing">
        <p>Body</p>
      </section>
    ));
    expect(role(container.querySelector("section") as HTMLElement)).toBe("generic");
  });

  test("an explicit role wins", () => {
    const { container } = render(() => <section role="status" />);
    expect(role(container.querySelector("section") as HTMLElement)).toBe("status");
  });

  test("two sections naming each other terminate", () => {
    const { container } = render(() => (
      <div>
        <section id="first" aria-labelledby="second">
          One
        </section>
        <section id="second" aria-labelledby="first">
          Two
        </section>
      </div>
    ));
    const [first, second] = [...container.querySelectorAll("section")];
    expect(first === undefined ? null : role(first)).toBe("region");
    expect(second === undefined ? null : role(second)).toBe("region");
  });

  test("a section inside a named control does not stop that control's name", () => {
    const { container } = render(() => (
      <button type="button">
        <section>Save</section>
      </button>
    ));
    expect(accessibleName(container.querySelector("button") as HTMLElement)).toBe("Save");
  });

  test("the checker walks a tree holding an unnamed section", () => {
    const { container } = render(() => (
      <section aria-live="polite">
        <ol>
          <li>Saved</li>
        </ol>
      </section>
    ));
    expect(ariaViolations(container)).toEqual([]);
  });

  test("a header inside an unnamed section is still scoped by it", () => {
    const { container } = render(() => (
      <section>
        <header>Title</header>
      </section>
    ));
    expect(role(container.querySelector("header") as HTMLElement)).toBe("generic");
  });
});
