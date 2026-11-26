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

describe("required states", () => {
  test("an option need not say whether it is selected, as ARIA 1.2 has it", () => {
    const { container } = render(() => (
      <ul role="listbox" aria-label="Fruit">
        <li role="option" aria-selected="true">
          Apple
        </li>
        <li role="option">Loading</li>
      </ul>
    ));
    expect(ariaViolations(container)).toEqual([]);
  });

  test("a checkbox still has to say whether it is checked", () => {
    const { container } = render(() => <div role="checkbox" aria-label="Agree" tabIndex={0} />);
    expect(ariaViolations(container).map((found) => found.rule)).toEqual(["aria-required-attr"]);
  });
});

describe("aria-hidden over focusable content", () => {
  test("is a trap while the content can take focus", async () => {
    render(() => (
      <div aria-hidden="true">
        <input aria-label="URL" />
      </div>
    ));
    expect((await ariaViolations(document.body)).map((one) => one.rule)).toEqual([
      "aria-hidden-focus",
    ]);
  });

  test("is not one under `hidden`, `until-found` included, where nothing takes focus", async () => {
    render(() => (
      <>
        <div aria-hidden="true" hidden="until-found">
          <input aria-label="URL" />
        </div>
        <div aria-hidden="true" hidden>
          <button type="button">Run</button>
        </div>
      </>
    ));
    expect(await ariaViolations(document.body)).toEqual([]);
  });
});

describe("a violation that fails a test", () => {
  test("prints as its rule, message and markup, not as the whole document", () => {
    const { container } = render(() => <div role="img" aria-labelledby="gone" />);
    const found = ariaViolations(container);
    expect(found.map((each) => each.rule)).toEqual(["aria-referenced-id-exists"]);
    expect(found[0]?.element).toBe(container.firstElementChild as Element);

    let failure = "";
    try {
      expect(found).toEqual([]);
    } catch (error) {
      failure = String(error);
    }
    expect(failure).toContain('points at "#gone"');
    expect(failure).toContain('<div role="img" aria-labelledby="gone">');
    expect(failure.length).toBeLessThan(2000);
  });
});
