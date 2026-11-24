import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { type Child, createSignal, flush, isDev, Show } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { createLandmarkController, landmark, type LandmarkRole } from "./landmark.ts";

interface LandmarkProps {
  children?: Child;
  "aria-label"?: string;
}

function region(role: LandmarkRole, tag: "main" | "nav" | "article") {
  return function Landmark(props: LandmarkProps) {
    const domRef = makeRef<HTMLElement>();
    const { landmarkProps } = landmark({
      role,
      ref: domRef,
      "aria-label": () => props["aria-label"],
    });
    if (tag === "main") {
      return (
        <main {...landmarkProps} ref={domRef.set}>
          {props.children}
        </main>
      );
    }
    if (tag === "nav") {
      return (
        <nav {...landmarkProps} ref={domRef.set}>
          {props.children}
        </nav>
      );
    }
    return (
      <article {...landmarkProps} ref={domRef.set}>
        {props.children}
      </article>
    );
  };
}

const Main = region("main", "main");
const Navigation = region("navigation", "nav");
const Region = region("region", "article");

function Links() {
  return (
    <ul>
      <li>
        <a href="/home">Home</a>
      </li>
      <li>
        <a href="/about">About</a>
      </li>
      <li>
        <a href="/contact">Contact</a>
      </li>
    </ul>
  );
}

interface FieldProps {
  label: string;
}

function Field(props: FieldProps) {
  return (
    <label>
      {props.label}
      <input type="text" />
    </label>
  );
}

function NavAndMain(props: LandmarkProps = {}) {
  return (
    <div>
      <Navigation>
        <Links />
      </Navigation>
      <Main>
        <Field label="First Name" />
      </Main>
      {props.children}
    </div>
  );
}

interface F6Options {
  shiftKey?: boolean;
  altKey?: boolean;
}

function f6(options: F6Options = {}): void {
  user.keyDown("F6", options);
  flush();
}

function active(): Element | null {
  return document.activeElement;
}

function links(): HTMLElement[] {
  return screen.getAllByRole("link");
}

let restore: (() => void)[] = [];

afterEach(() => {
  for (const undo of restore) undo();
  restore = [];
});

function silenceWarnings(): ReturnType<typeof spyOn> {
  const spy = spyOn(console, "warn").mockImplementation(() => {});
  restore.push(() => spy.mockRestore());
  return spy;
}

describe("landmark", () => {
  test("Tab still enters a landmark at its first control", () => {
    render(() => <NavAndMain />);
    expect(screen.getByRole("navigation")).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();

    user.tab();
    expect(active()).toBe(links()[0] as HTMLElement);
  });

  test("F6 moves to each landmark in turn", () => {
    render(() => <NavAndMain />);

    f6();
    expect(active()).toBe(screen.getByRole("navigation"));
    f6();
    expect(active()).toBe(screen.getByRole("main"));
  });

  test("F6 reaches the only landmark there is", () => {
    render(() => (
      <Main>
        <Field label="First Name" />
      </Main>
    ));

    f6();
    expect(active()).toBe(screen.getByRole("main"));
  });

  test("a nested landmark that comes first follows its parent", () => {
    render(() => (
      <Main>
        <Region>
          <input type="checkbox" aria-label="Checkbox" />
        </Region>
        <Field label="First Name" />
      </Main>
    ));
    const main = screen.getByRole("main");
    const inner = screen.getByRole("region");

    f6();
    expect(active()).toBe(main);
    f6();
    expect(active()).toBe(inner);
    f6();
    expect(active()).toBe(main);
    f6();
    expect(active()).toBe(inner);
    f6({ shiftKey: true });
    expect(active()).toBe(main);
    f6({ shiftKey: true });
    expect(active()).toBe(inner);
  });

  test("a nested landmark that comes last follows its parent", () => {
    render(() => (
      <Main>
        <Field label="First Name" />
        <Region>
          <input type="checkbox" aria-label="Checkbox" />
        </Region>
      </Main>
    ));
    const main = screen.getByRole("main");
    const inner = screen.getByRole("region");

    f6();
    expect(active()).toBe(main);
    f6();
    expect(active()).toBe(inner);
    f6();
    expect(active()).toBe(main);
    f6({ shiftKey: true });
    expect(active()).toBe(inner);
  });

  test("two nested landmarks go in document order", () => {
    render(() => (
      <Main>
        <Region aria-label="Region 1">
          <input type="checkbox" aria-label="One" />
        </Region>
        <Field label="First Name" />
        <Region aria-label="Region 2">
          <input type="checkbox" aria-label="Two" />
        </Region>
        <Field label="Last Name" />
      </Main>
    ));
    const main = screen.getByRole("main");
    const [first, second] = screen.getAllByRole("region");

    f6();
    expect(active()).toBe(main);
    f6();
    expect(active()).toBe(first as HTMLElement);
    f6();
    expect(active()).toBe(second as HTMLElement);
    f6();
    expect(active()).toBe(main);
    f6({ shiftKey: true });
    expect(active()).toBe(second as HTMLElement);
    f6({ shiftKey: true });
    expect(active()).toBe(first as HTMLElement);
    f6({ shiftKey: true });
    expect(active()).toBe(main);
  });

  test("F6 from inside a landmark goes to the next one, and wraps", () => {
    render(() => <NavAndMain />);

    user.tab();
    expect(active()).toBe(links()[0] as HTMLElement);

    f6();
    expect(active()).toBe(screen.getByRole("main"));

    // Back into the navigation, where focus was left.
    f6();
    expect(active()).toBe(links()[0] as HTMLElement);
  });

  test("Shift+F6 moves backwards, and wraps", () => {
    render(() => <NavAndMain />);

    f6({ shiftKey: true });
    expect(active()).toBe(screen.getByRole("main"));
    f6({ shiftKey: true });
    expect(active()).toBe(screen.getByRole("navigation"));

    user.focus(links()[0] as HTMLElement);
    f6({ shiftKey: true });
    expect(active()).toBe(screen.getByRole("main"));
    f6({ shiftKey: true });
    expect(active()).toBe(links()[0] as HTMLElement);
  });

  test("F6 returns to the element last focused inside a landmark", () => {
    render(() => <NavAndMain />);

    user.tab();
    user.tab();
    user.tab();
    user.tab();
    expect(active()).toBe(screen.getByRole("textbox"));

    f6();
    expect(active()).toBe(links()[2] as HTMLElement);
  });

  test("Alt+F6 goes straight to main", () => {
    render(() => (
      <div>
        <Navigation>
          <Links />
        </Navigation>
        <Region>
          <Field label="Last Name" />
        </Region>
        <Main>
          <Field label="First Name" />
        </Main>
      </div>
    ));

    user.focus(links()[0] as HTMLElement);
    f6({ altKey: true });
    expect(active()).toBe(screen.getByRole("main"));
  });

  test("Alt+F6 does nothing without a main landmark, and leaves the key alone", () => {
    render(() => (
      <Navigation>
        <Links />
      </Navigation>
    ));

    user.focus(links()[0] as HTMLElement);
    const proceeded = user.keyDown("F6", { altKey: true });
    flush();
    expect(proceeded).toBe(true);
    expect(active()).toBe(links()[0] as HTMLElement);
  });

  test("a landmark is out of the Tab order until F6 focuses it, and only while it holds focus", () => {
    render(() => <NavAndMain />);
    const nav = screen.getByRole("navigation");
    const main = screen.getByRole("main");
    expect(nav.hasAttribute("tabindex")).toBe(false);
    expect(main.hasAttribute("tabindex")).toBe(false);

    f6();
    expect(nav.getAttribute("tabindex")).toBe("-1");
    expect(main.hasAttribute("tabindex")).toBe(false);

    f6();
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(nav.hasAttribute("tabindex")).toBe(false);
  });

  test("a pointer cannot focus a landmark", () => {
    render(() => <NavAndMain />);
    user.click(screen.getByRole("navigation"));
    flush();
    expect(active()).toBe(document.body);
  });

  test("tabbing on from a focused landmark gives back its tabindex", () => {
    render(() => <NavAndMain />);
    const nav = screen.getByRole("navigation");

    f6();
    expect(active()).toBe(nav);

    user.tab();
    expect(active()).toBe(links()[0] as HTMLElement);
    expect(nav.hasAttribute("tabindex")).toBe(false);
  });

  test("a landmark blurred to nothing is focusable by F6 again", () => {
    render(() => <NavAndMain />);
    const nav = screen.getByRole("navigation");

    f6();
    expect(active()).toBe(nav);

    user.blur(nav);
    expect(nav.hasAttribute("tabindex")).toBe(false);
    expect(active()).toBe(document.body);

    f6();
    expect(nav.getAttribute("tabindex")).toBe("-1");
    expect(active()).toBe(nav);
  });

  test("a removed landmark drops out of the sequence", () => {
    const [shown, setShown] = createSignal(true);
    render(() => (
      <div>
        <Navigation>
          <Links />
        </Navigation>
        <Show when={shown()}>
          <Region>
            <Field label="First Name" />
          </Region>
        </Show>
        <Main>
          <Field label="Last Name" />
        </Main>
      </div>
    ));

    f6();
    expect(active()).toBe(screen.getByRole("navigation"));
    f6();
    expect(active()).toBe(screen.getByRole("region"));
    f6();
    expect(active()).toBe(screen.getByRole("main"));

    setShown(false);
    flush();

    f6({ shiftKey: true });
    expect(active()).toBe(screen.getByRole("navigation"));
  });

  test("an added landmark joins the sequence in document order", () => {
    const [shown, setShown] = createSignal(false);
    render(() => (
      <div>
        <Navigation>
          <Links />
        </Navigation>
        <Main>
          <Field label="Last Name" />
          <Show when={shown()}>
            <Region>
              <Field label="First Name" />
            </Region>
          </Show>
        </Main>
      </div>
    ));

    f6();
    expect(active()).toBe(screen.getByRole("navigation"));
    f6();
    expect(active()).toBe(screen.getByRole("main"));

    setShown(true);
    flush();

    f6();
    expect(active()).toBe(screen.getByRole("region"));
  });

  test("a landmark added around existing ones comes before them", () => {
    const [wrapped, setWrapped] = createSignal(false);
    function Contained() {
      return (
        <div>
          <Navigation>
            <Links />
          </Navigation>
          <Region>
            <Field label="Last Name" />
          </Region>
        </div>
      );
    }
    render(() => (
      <Show when={wrapped()} fallback={<Contained />}>
        <Main>
          <Field label="First Name" />
          <Contained />
        </Main>
      </Show>
    ));

    setWrapped(true);
    flush();

    f6();
    expect(active()).toBe(screen.getByRole("main"));
  });

  test("a landmark under aria-hidden is skipped", () => {
    render(() => (
      <Main>
        <div aria-hidden="true">
          <Region aria-label="Region 1">
            <input type="checkbox" aria-label="One" />
          </Region>
        </div>
        <Field label="First Name" />
        <Region aria-label="Region 2">
          <input type="checkbox" aria-label="Two" />
        </Region>
      </Main>
    ));
    const main = screen.getByRole("main");
    const visible = screen.getByRole("region");

    f6();
    expect(active()).toBe(main);
    f6();
    expect(active()).toBe(visible);
    f6();
    expect(active()).toBe(main);
    f6({ shiftKey: true });
    expect(active()).toBe(visible);
    f6({ shiftKey: true });
    expect(active()).toBe(main);
  });

  test("wrapping forward announces itself, and a page that cancels it keeps focus", () => {
    render(() => <NavAndMain />);
    const heard: unknown[] = [];
    function listener(event: Event): void {
      event.preventDefault();
      heard.push((event as CustomEvent).detail);
    }
    window.addEventListener("barq-landmark-navigation", listener);
    restore.push(() => window.removeEventListener("barq-landmark-navigation", listener));

    user.tab();
    f6();
    expect(active()).toBe(screen.getByRole("main"));

    f6();
    expect(active()).toBe(screen.getByRole("main"));
    expect(heard).toEqual([{ direction: "forward" }]);
  });

  test("wrapping backward announces itself too", () => {
    render(() => <NavAndMain />);
    const heard: unknown[] = [];
    function listener(event: Event): void {
      event.preventDefault();
      heard.push((event as CustomEvent).detail);
    }
    window.addEventListener("barq-landmark-navigation", listener);
    restore.push(() => window.removeEventListener("barq-landmark-navigation", listener));

    user.tab();
    f6({ shiftKey: true });
    expect(active()).toBe(links()[0] as HTMLElement);
    expect(heard).toEqual([{ direction: "backward" }]);
  });

  test("the keyboard listener goes when the last landmark does", () => {
    const [shown, setShown] = createSignal(true);
    const keys: string[] = [];
    render(() => (
      <div>
        <button type="button" onKeyDown={(event: KeyboardEvent) => keys.push(event.key)}>
          Focusable
        </button>
        <Show when={shown()}>
          <Navigation>
            <Links />
          </Navigation>
        </Show>
      </div>
    ));
    const button = screen.getByRole("button");

    user.focus(button);
    f6();
    expect(active()).toBe(screen.getByRole("navigation"));
    // Handled, so it went no further.
    expect(keys).toEqual([]);

    setShown(false);
    flush();
    user.focus(button);
    f6();
    expect(keys).toEqual(["F6"]);
  });

  test("two landmarks of one role, both labelled differently, are fine", () => {
    const warn = silenceWarnings();
    render(() => (
      <div>
        <Navigation aria-label="First nav">
          <Links />
        </Navigation>
        <Navigation aria-label="Second nav">
          <Links />
        </Navigation>
        <Main>
          <Field label="First Name" />
        </Main>
      </div>
    ));
    expect(warn).not.toHaveBeenCalled();
  });

  test("two landmarks of one role without labels are warned about in development", () => {
    const warn = silenceWarnings();
    render(() => (
      <div>
        <Navigation>
          <Links />
        </Navigation>
        <Navigation>
          <Links />
        </Navigation>
      </div>
    ));
    const navs = screen.getAllByRole("navigation");
    const said = warn.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes("all must be labeled"),
    );
    expect(said !== undefined).toBe(isDev);
    if (said !== undefined) {
      expect(said[0]).toBe(
        "Page contains more than one landmark with the 'navigation' role. If two or more landmarks on a page share the same role, all must be labeled with an aria-label or aria-labelledby attribute: ",
      );
      expect(said[1]).toEqual(navs);
    }
  });

  test("two landmarks of one role with the same label are warned about in development", () => {
    const warn = silenceWarnings();
    render(() => (
      <div>
        <Navigation aria-label="First nav">
          <Links />
        </Navigation>
        <Navigation aria-label="First nav">
          <Links />
        </Navigation>
      </div>
    ));
    const navs = screen.getAllByRole("navigation");
    const said = warn.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes("unique labels"),
    );
    expect(said !== undefined).toBe(isDev);
    if (said !== undefined) {
      expect(said[0]).toBe(
        "Page contains more than one landmark with the 'navigation' role and 'First nav' label. If two or more landmarks on a page share the same role, they must have unique labels: ",
      );
      expect(said[1]).toEqual(navs);
    }
  });

  test("a label that changes is checked again", () => {
    const warn = silenceWarnings();
    const [second, setSecond] = createSignal("nav label 2");
    render(() => (
      <div>
        <Navigation aria-label="nav label 1">
          <Links />
        </Navigation>
        <Navigation aria-label={second()}>
          <Links />
        </Navigation>
      </div>
    ));
    expect(warn).not.toHaveBeenCalled();

    setSecond("nav label 1");
    flush();
    const said = warn.mock.calls.some((call: unknown[]) =>
      String(call[0]).includes("'nav label 1' label"),
    );
    expect(said).toBe(isDev);
  });

  test("a second main landmark is an error in development", () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    restore.push(() => error.mockRestore());
    render(() => (
      <div>
        <Main aria-label="One" />
        <Main aria-label="Two" />
      </div>
    ));
    const said = error.mock.calls.some((call: unknown[]) =>
      String(call[0]).includes('role "main"'),
    );
    expect(said).toBe(isDev);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <NavAndMain />);
    expectNoAriaViolations(container);
  });
});

describe("createLandmarkController", () => {
  test("keeps F6 listened for with no landmark on the page", () => {
    const heard: unknown[] = [];
    function listener(event: Event): void {
      event.preventDefault();
      heard.push((event as CustomEvent).detail);
    }
    window.addEventListener("barq-landmark-navigation", listener);
    restore.push(() => window.removeEventListener("barq-landmark-navigation", listener));

    f6();
    expect(heard).toHaveLength(0);

    const controller = createLandmarkController();
    f6();
    expect(heard).toHaveLength(1);

    controller.dispose();
    f6();
    expect(heard).toHaveLength(1);
  });

  test("moves forward", () => {
    render(() => <NavAndMain />);
    user.tab();
    expect(active()).toBe(links()[0] as HTMLElement);

    const controller = createLandmarkController();
    restore.push(() => controller.dispose());

    expect(controller.focusNext()).toBe(true);
    flush();
    expect(active()).toBe(screen.getByRole("main"));

    controller.navigate("forward");
    flush();
    expect(active()).toBe(links()[0] as HTMLElement);
  });

  test("moves backward", () => {
    render(() => <NavAndMain />);
    user.focus(screen.getByRole("textbox"));

    const controller = createLandmarkController();
    restore.push(() => controller.dispose());

    controller.focusPrevious();
    flush();
    expect(active()).toBe(screen.getByRole("navigation"));

    controller.navigate("backward");
    flush();
    expect(active()).toBe(screen.getByRole("textbox"));
  });

  test("moves from a given element rather than the focused one", () => {
    render(() => <NavAndMain />);
    const controller = createLandmarkController();
    restore.push(() => controller.dispose());

    controller.focusNext({ from: screen.getByRole("navigation") });
    flush();
    expect(active()).toBe(screen.getByRole("main"));
  });

  test("focuses main", () => {
    render(() => <NavAndMain />);
    user.focus(screen.getByRole("textbox"));

    const controller = createLandmarkController();
    restore.push(() => controller.dispose());

    controller.focusMain();
    flush();
    expect(active()).toBe(screen.getByRole("main"));
  });
});

interface LandmarkManager {
  version: number;
  createLandmarkController: unknown;
  registerLandmark: unknown;
}

interface VersionedManager {
  version: number;
}

describe("one manager per document", () => {
  const key = Symbol.for("barq-landmark-manager");
  type Holder = Record<symbol, unknown>;

  test("the manager lives on the document", () => {
    const controller = createLandmarkController();
    const manager = (document as unknown as Holder)[key] as LandmarkManager;
    expect(typeof manager.version).toBe("number");
    expect(typeof manager.createLandmarkController).toBe("function");
    expect(typeof manager.registerLandmark).toBe("function");
    controller.dispose();
  });

  test("a newer manager takes over, and everything follows it", () => {
    const { unmount } = render(() => (
      <Main>
        <Field label="First Name" />
      </Main>
    ));
    const controller = createLandmarkController();
    const holder = document as unknown as Holder;
    const original = holder[key] as VersionedManager;

    const calls: string[] = [];
    let unregistered = 0;
    const newer = {
      version: original.version + 1,
      createLandmarkController: () => ({
        navigate: (direction: string, options: unknown) => {
          calls.push(`navigate ${direction} ${String(options)}`);
          return true;
        },
        focusNext: () => (calls.push("focusNext"), true),
        focusPrevious: () => (calls.push("focusPrevious"), true),
        focusMain: () => (calls.push("focusMain"), true),
        dispose: () => calls.push("dispose"),
      }),
      registerLandmark: () => {
        calls.push("registerLandmark");
        return () => unregistered++;
      },
    };

    holder[key] = newer;
    try {
      document.dispatchEvent(new CustomEvent("barq-landmark-manager-change"));
      flush();

      expect(calls.filter((call) => call === "registerLandmark")).toHaveLength(1);

      controller.navigate("forward");
      controller.focusNext();
      controller.focusPrevious();
      controller.focusMain();
      controller.dispose();
      expect(calls.filter((call) => call !== "registerLandmark")).toEqual([
        "navigate forward undefined",
        "focusNext",
        "focusPrevious",
        "focusMain",
        "dispose",
      ]);

      unmount();
      expect(unregistered).toBe(1);
    } finally {
      holder[key] = original;
    }
  });
});
