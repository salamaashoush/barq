import { describe, expect, test } from "bun:test";

import { flush, signal, Show, type Incoming } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";
import { createFocusManager, focusRing, focusScope, focusableWalker } from "./focus.ts";
import { setInteractionModality } from "./interactions/modality.ts";

function Trap(props: { autoFocus?: boolean; contain?: boolean; restoreFocus?: boolean }) {
  const scope = focusScope({
    contain: props.contain,
    restoreFocus: props.restoreFocus,
    autoFocus: props.autoFocus,
  });

  return (
    <>
      <span hidden ref={scope.startRef} />
      <button type="button">first</button>
      <button type="button">second</button>
      <button type="button">third</button>
      <span hidden ref={scope.endRef} />
    </>
  );
}

describe("focusableWalker", () => {
  test("finds the tabbable elements in document order", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <button>a</button>
      <input type="text" />
      <button disabled>skipped</button>
      <div tabindex="-1">not tabbable</div>
      <a href="#x">link</a>
    `;
    document.body.appendChild(container);

    const walker = focusableWalker(container, { tabbable: true });
    const found: string[] = [];
    let node = walker.nextNode();
    while (node !== null) {
      found.push((node as Element).tagName.toLowerCase());
      node = walker.nextNode();
    }

    expect(found).toEqual(["button", "input", "a"]);
    container.remove();
  });

  test("a focusable walk includes tabindex -1", () => {
    const container = document.createElement("div");
    container.innerHTML = `<button>a</button><div tabindex="-1">b</div>`;
    document.body.appendChild(container);

    const walker = focusableWalker(container, { tabbable: false });
    const found: string[] = [];
    let node = walker.nextNode();
    while (node !== null) {
      found.push((node as Element).tagName.toLowerCase());
      node = walker.nextNode();
    }

    expect(found).toEqual(["button", "div"]);
    container.remove();
  });
});

describe("createFocusManager", () => {
  test("moves focus forward, backward, and to the ends", () => {
    let root: HTMLElement | null = null;

    function Toolbar() {
      const manager = createFocusManager(() => root, { tabbable: true, wrap: true });
      return (
        <div
          ref={(el: HTMLElement) => {
            root = el;
          }}
          data-testid="toolbar"
        >
          <button type="button" onClick={() => manager.focusNext()}>
            one
          </button>
          <button type="button">two</button>
          <button type="button">three</button>
        </div>
      );
    }

    render(() => <Toolbar />);
    const manager = createFocusManager(() => root, { tabbable: true, wrap: true });

    manager.focusFirst();
    expect(document.activeElement?.textContent).toBe("one");

    manager.focusNext();
    expect(document.activeElement?.textContent).toBe("two");

    manager.focusPrevious();
    expect(document.activeElement?.textContent).toBe("one");

    manager.focusLast();
    expect(document.activeElement?.textContent).toBe("three");

    manager.focusNext();
    expect(document.activeElement?.textContent).toBe("one");
  });
});

describe("focusScope", () => {
  test("autoFocus lands on the first tabbable element", async () => {
    render(() => <Trap autoFocus />);
    await tick();

    expect(document.activeElement?.textContent).toBe("first");
  });

  test("contain keeps Tab inside", async () => {
    render(() => (
      <>
        <button type="button">outside before</button>
        <Trap autoFocus contain />
        <button type="button">outside after</button>
      </>
    ));
    await tick();

    expect(document.activeElement?.textContent).toBe("first");

    user.tab();
    expect(document.activeElement?.textContent).toBe("second");
    user.tab();
    expect(document.activeElement?.textContent).toBe("third");

    // Past the last element, focus wraps to the first rather than leaving.
    user.tab();
    expect(document.activeElement?.textContent).toBe("first");

    user.tab({ shift: true });
    expect(document.activeElement?.textContent).toBe("third");
  });

  test("without contain, Tab leaves", async () => {
    render(() => (
      <>
        <Trap autoFocus />
        <button type="button">outside after</button>
      </>
    ));
    await tick();

    user.tab();
    user.tab();
    user.tab();

    expect(document.activeElement?.textContent).toBe("outside after");
  });

  test("the manager moves focus inside the scope", async () => {
    let manager: ReturnType<typeof focusScope>["manager"] | undefined;

    function WithManager() {
      const scope = focusScope({});
      manager = scope.manager;
      return (
        <>
          <span hidden ref={scope.startRef} />
          <button type="button">alpha</button>
          <button type="button">beta</button>
          <span hidden ref={scope.endRef} />
        </>
      );
    }

    render(() => <WithManager />);
    await tick();

    manager?.focusFirst();
    expect(document.activeElement?.textContent).toBe("alpha");
    manager?.focusNext();
    expect(document.activeElement?.textContent).toBe("beta");
  });
});

describe("focusRing", () => {
  function Ringed() {
    const { focusProps, isFocused, isFocusVisible } = focusRing();
    return (
      <button
        type="button"
        {...focusProps}
        data-focused={isFocused}
        data-focus-visible={isFocusVisible}
      >
        ring
      </button>
    );
  }

  test("a keyboard focus shows the ring", () => {
    render(() => <Ringed />);
    const button = screen.getByRole("button");

    setInteractionModality("keyboard");
    user.focus(button);

    expect(button.hasAttribute("data-focused")).toBe(true);
    expect(button.hasAttribute("data-focus-visible")).toBe(true);
  });

  test("a pointer focus does not", () => {
    render(() => <Ringed />);
    const button = screen.getByRole("button");

    setInteractionModality("pointer");
    user.focus(button);

    expect(button.hasAttribute("data-focused")).toBe(true);
    expect(button.hasAttribute("data-focus-visible")).toBe(false);
  });

  test("within watches the subtree", () => {
    function Group() {
      const { focusProps, isFocused } = focusRing({ within: true });
      return (
        <div {...focusProps} data-focused={isFocused} data-testid="group">
          <button type="button">inner</button>
        </div>
      );
    }

    render(() => <Group />);
    user.focus(screen.getByRole("button"));

    expect(screen.getByTestId("group").hasAttribute("data-focused")).toBe(true);
  });
});

/**
 * A scope whose sentinels arrive after its effects do.
 *
 * `focusScope` creates its effects in the component body, and the sentinels are
 * refs on JSX built afterwards — later still when the content is inside a
 * `<Show>` or a `<Portal>`. The scope's extent used to be read from two plain
 * fields, so the first read found nothing and nothing told it to look again:
 * the scope stayed empty for its whole life, and an overlay built that way
 * neither autofocused, nor contained Tab, nor closed on Escape. It was
 * invisible under happy-dom only because a bump happened to land after both
 * refs had run.
 */
describe("a scope whose content appears later", () => {
  function Late(props: Incoming<{ open: boolean }>) {
    const scope = focusScope({ contain: true, autoFocus: true });
    return (
      <>
        <button type="button">outside</button>
        <Show when={props.open()}>
          <span hidden ref={scope.startRef} />
          <button type="button">inside first</button>
          <button type="button">inside second</button>
          <span hidden ref={scope.endRef} />
        </Show>
      </>
    );
  }

  test("autofocus lands inside once the content is there", async () => {
    const open = signal(false);
    render(() => <Late open={open()} />);
    expect(document.activeElement?.textContent).not.toBe("inside first");

    open.set(true);
    flush();
    await tick();
    flush();

    expect(document.activeElement?.textContent).toBe("inside first");
  });
});
