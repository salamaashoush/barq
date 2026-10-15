import { afterEach, describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Toaster, toast, type ToasterPosition } from "./sonner.tsx";

/** Long enough for a timer scheduled at `ms` to have run. */
function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 25));
}

const toasts = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-slot="toast"]'),
];

afterEach(() => {
  // The queue is module-level on purpose, so one test's toasts would otherwise
  // be the next test's.
  toast.clear();
});

describe("Toaster", () => {
  test("it is a live REGION, not something that takes focus", () => {
    // Moving focus to something that appeared on its own takes the keyboard
    // away from whatever the person was doing.
    render(() => <Toaster />);
    const region = document.querySelector('[data-slot="toaster"]');
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.getAttribute("aria-label")).toBe("Notifications");
    // `polite` and not `assertive`: "Saved" must not interrupt a sentence.
    expect(region?.getAttribute("aria-live")).not.toBe("assertive");
  });

  test("nothing is shown until something is raised", () => {
    render(() => <Toaster />);
    expect(toasts()).toHaveLength(0);
  });

  test("a toast appears, with its title", () => {
    render(() => <Toaster />);
    toast("Saved");
    flush();
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]?.textContent).toContain("Saved");
  });

  test("each kind marks itself, which is what the icon and the style read", () => {
    render(() => <Toaster />);
    toast.success("Yes");
    toast.error("No");
    flush();
    expect(toasts().map((each) => each.getAttribute("data-kind"))).toEqual(["success", "error"]);
  });

  test("a description sits under the title", () => {
    render(() => <Toaster />);
    toast("Deleted", { description: "Three files" });
    flush();
    expect(document.querySelector('[data-slot="toast-title"]')?.textContent).toContain("Deleted");
    expect(document.querySelector('[data-slot="toast-description"]')?.textContent).toContain(
      "Three files",
    );
  });

  test("it goes on its own", async () => {
    render(() => <Toaster />);
    toast("Saved", { duration: 40 });
    flush();
    expect(toasts()).toHaveLength(1);
    await after(40);
    flush();
    expect(toasts()).toHaveLength(0);
  });

  test("the close button takes it away", async () => {
    render(() => <Toaster />);
    toast("Saved", { duration: 10_000 });
    flush();
    await user.click(document.querySelector('[data-slot="toast-close"]') as HTMLElement);
    flush();
    expect(toasts()).toHaveLength(0);
  });

  test("an action runs and then dismisses, because it answered the toast", async () => {
    const undone: string[] = [];
    render(() => <Toaster />);
    toast("Deleted", {
      duration: 10_000,
      action: { label: "Undo", onAction: () => undone.push("yes") },
    });
    flush();
    await user.click(document.querySelector('[data-slot="toast-action"]') as HTMLElement);
    flush();
    expect(undone).toEqual(["yes"]);
    expect(toasts()).toHaveLength(0);
  });

  test("a loading toast has no clock of its own", async () => {
    // It goes when the work says so; a timer would take it away mid-flight.
    render(() => <Toaster />);
    toast.loading("Saving");
    flush();
    await after(60);
    flush();
    expect(toasts()).toHaveLength(1);
  });

  test("promise moves one toast from loading to success, in place", async () => {
    render(() => <Toaster />);
    toast("First");
    flush();
    const work = toast.promise(Promise.resolve(42), {
      loading: "Saving",
      success: (value) => `Saved ${String(value)}`,
      error: "Failed",
    });
    flush();
    expect(toasts()).toHaveLength(2);
    expect(toasts()[1]?.getAttribute("data-kind")).toBe("loading");

    await work;
    flush();
    // Still two, and still in the same order: a "Saving" that becomes "Saved"
    // by jumping to the bottom reads as a second thing happening.
    expect(toasts()).toHaveLength(2);
    expect(toasts()[1]?.textContent).toContain("Saved 42");
    expect(toasts()[1]?.getAttribute("data-kind")).toBe("success");
  });

  test("a rejected promise says so, and still rejects for the caller", async () => {
    render(() => <Toaster />);
    const work = toast.promise(Promise.reject(new Error("nope")), {
      loading: "Saving",
      success: "Saved",
      error: "Failed",
    });
    await expect(work).rejects.toThrow("nope");
    flush();
    expect(toasts()[0]?.getAttribute("data-kind")).toBe("error");
    expect(toasts()[0]?.textContent).toContain("Failed");
  });

  test("the column is capped, and the oldest is what goes", () => {
    render(() => <Toaster />);
    for (const title of ["one", "two", "three", "four"]) toast(title);
    flush();
    expect(toasts()).toHaveLength(3);
    expect(toasts()[0]?.textContent).toContain("two");
    expect(toasts()[2]?.textContent).toContain("four");
  });
});

const lists = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-slot="toaster-list"]'),
];

const region = (): HTMLElement => document.querySelector('[data-slot="toaster"]') as HTMLElement;

const titles = (): (string | null | undefined)[] =>
  toasts().map((each) => each.querySelector('[data-slot="toast-title"]')?.textContent);

describe("Toaster, where the toasts go", () => {
  test("bottom right unless told otherwise", () => {
    render(() => <Toaster />);
    toast("Saved");
    flush();
    expect(lists()).toHaveLength(1);
    expect(lists()[0]?.getAttribute("data-y-position")).toBe("bottom");
    expect(lists()[0]?.getAttribute("data-x-position")).toBe("right");
    expect(toasts()[0]?.getAttribute("data-y-position")).toBe("bottom");
    expect(toasts()[0]?.getAttribute("data-x-position")).toBe("right");
  });

  test("each of the six positions is a pair of attributes the rules select on", () => {
    const all: ToasterPosition[] = [
      "top-left",
      "top-center",
      "top-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ];
    for (const position of all) {
      const view = render(() => <Toaster position={position} />);
      toast("Saved");
      flush();
      const [y, x] = position.split("-");
      expect(lists()[0]?.getAttribute("data-y-position")).toBe(y as string);
      expect(lists()[0]?.getAttribute("data-x-position")).toBe(x as string);
      toast.clear();
      flush();
      view.unmount();
    }
  });

  test("a toast can ask for a corner of its own, which is a second list", () => {
    render(() => <Toaster />);
    toast("Here");
    toast("There", { position: "top-left" });
    flush();
    expect(lists()).toHaveLength(2);
    const there = lists().find((each) => each.getAttribute("data-y-position") === "top");
    expect(there?.getAttribute("data-x-position")).toBe("left");
    expect(there?.textContent).toContain("There");
    expect(there?.textContent).not.toContain("Here");
  });

  test("the list is an ordered list of items, inside the region", () => {
    render(() => <Toaster />);
    toast("Saved");
    flush();
    expect(lists()[0]?.tagName).toBe("OL");
    expect(toasts()[0]?.tagName).toBe("LI");
    expect(region().contains(lists()[0] as HTMLElement)).toBe(true);
  });

  test("the offset and the gap are custom properties on the list", () => {
    render(() => <Toaster />);
    toast("Saved");
    flush();
    const list = lists()[0] as HTMLElement;
    expect(list.style.getPropertyValue("--gap")).toBe("14px");
    expect(list.style.getPropertyValue("--offset-bottom")).toBe("24px");
    expect(list.style.getPropertyValue("--offset-right")).toBe("24px");
    expect(list.style.getPropertyValue("--mobile-offset-bottom")).toBe("16px");
  });

  test("a number, a length and a side-by-side object are all offsets", () => {
    const first = render(() => <Toaster gap={8} offset={40} />);
    toast("Saved");
    flush();
    expect(lists()[0]?.style.getPropertyValue("--gap")).toBe("8px");
    expect(lists()[0]?.style.getPropertyValue("--offset-top")).toBe("40px");
    toast.clear();
    flush();
    first.unmount();

    render(() => <Toaster offset={{ top: "2rem", left: 12 }} />);
    toast("Saved");
    flush();
    expect(lists()[0]?.style.getPropertyValue("--offset-top")).toBe("2rem");
    expect(lists()[0]?.style.getPropertyValue("--offset-left")).toBe("12px");
    // A side that was not named keeps the default rather than collapsing to 0.
    expect(lists()[0]?.style.getPropertyValue("--offset-bottom")).toBe("24px");
  });

  test("the direction is the reading direction unless the prop says", () => {
    const first = render(() => <Toaster />);
    toast("Saved");
    flush();
    expect(lists()[0]?.getAttribute("dir")).toBe("ltr");
    toast.clear();
    flush();
    first.unmount();

    render(() => <Toaster dir="rtl" />);
    toast("Saved");
    flush();
    expect(lists()[0]?.getAttribute("dir")).toBe("rtl");
  });

  test("the theme is an attribute, and system asks the browser", () => {
    const first = render(() => <Toaster theme="dark" />);
    toast("Saved");
    flush();
    expect(lists()[0]?.getAttribute("data-theme")).toBe("dark");
    toast.clear();
    flush();
    first.unmount();

    const real = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("dark"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    render(() => <Toaster theme="system" />);
    toast("Saved");
    flush();
    expect(lists()[0]?.getAttribute("data-theme")).toBe("dark");
    window.matchMedia = real;
  });
});

describe("Toaster, the stack", () => {
  test("the newest is the front, and the rest count back from it", () => {
    render(() => <Toaster />);
    for (const title of ["one", "two", "three"]) toast(title);
    flush();
    expect(toasts().map((each) => each.getAttribute("data-front"))).toEqual([
      "false",
      "false",
      "true",
    ]);
    expect(toasts().map((each) => each.getAttribute("data-index"))).toEqual(["2", "1", "0"]);
    expect(toasts()[0]?.style.getPropertyValue("--toasts-before")).toBe("2");
    // In front means on top, whatever order the markup is in.
    expect(Number(toasts()[2]?.style.getPropertyValue("--z-index"))).toBeGreaterThan(
      Number(toasts()[0]?.style.getPropertyValue("--z-index")),
    );
  });

  test("it is collapsed until the pointer is over it", async () => {
    render(() => <Toaster />);
    toast("one");
    toast("two");
    flush();
    expect(toasts().map((each) => each.getAttribute("data-expanded"))).toEqual(["false", "false"]);
    await user.hover(toasts()[1] as HTMLElement);
    flush();
    expect(toasts().map((each) => each.getAttribute("data-expanded"))).toEqual(["true", "true"]);
    await user.unhover(toasts()[1] as HTMLElement);
    flush();
    expect(toasts().map((each) => each.getAttribute("data-expanded"))).toEqual(["false", "false"]);
  });

  test("expand keeps it open without a pointer", () => {
    render(() => <Toaster expand />);
    toast("one");
    toast("two");
    flush();
    expect(toasts().map((each) => each.getAttribute("data-expanded"))).toEqual(["true", "true"]);
  });

  test("a collapsed toast behind the front one is drawn at the front one's height", () => {
    render(() => <Toaster />);
    toast("one");
    flush();
    const rules = rulesFor([...(toasts()[0]?.classList ?? [])].join(" "));
    expect(rules).toContain('[data-expanded="false"][data-front="false"]');
    expect(rules).toContain("var(--front-toast-height)");
  });

  test("a collapsed toast behind the front one shrinks by a twentieth a place, and is not mirrored", () => {
    render(() => <Toaster />);
    toast("one");
    flush();
    const rules = rulesFor([...(toasts()[0]?.classList ?? [])].join(" "));
    // sonner writes `--scale: var(--toasts-before) * 0.05 + 1` and then
    // `scale(calc(-1 * var(--scale)))`, which the substitution turns into
    // `1 - 0.05n`. Wrapped in a `calc()` of its own the same text is
    // `-(1 + 0.05n)`: every toast behind the front one upside down and larger.
    expect(rules).toContain("--scale: calc(1 - var(--toasts-before) * 0.05)");
    expect(rules).toContain("scale(var(--scale))");
    expect(rules).not.toContain("scale(calc(-1 * var(--scale)))");
  });

  test("visibleToasts is how many are drawn, and one behind them comes back", async () => {
    render(() => <Toaster visibleToasts={2} />);
    for (const title of ["one", "two", "three"]) toast(title, { duration: 10_000 });
    flush();
    expect(titles()).toEqual(["two", "three"]);
    // It was waiting, not gone: taking the front one away makes room for it.
    await user.click(toasts()[1]?.querySelector('[data-slot="toast-close"]') as HTMLElement);
    flush();
    expect(titles()).toEqual(["one", "two"]);
  });
});

describe("Toaster, the clock", () => {
  test("the toaster's duration is the default for every toast", async () => {
    render(() => <Toaster duration={40} />);
    toast("Saved");
    flush();
    expect(toasts()).toHaveLength(1);
    await after(40);
    flush();
    expect(toasts()).toHaveLength(0);
  });

  test("a pointer over the stack stops the clock, and leaving starts it again", async () => {
    render(() => <Toaster />);
    toast("Read me", { duration: 60 });
    flush();
    await user.hover(toasts()[0] as HTMLElement);
    await after(80);
    flush();
    // A toast that expired while the pointer was over it was never read.
    expect(toasts()).toHaveLength(1);
    await user.unhover(toasts()[0] as HTMLElement);
    await after(80);
    flush();
    expect(toasts()).toHaveLength(0);
  });

  test("a hidden tab stops it too", async () => {
    let hidden = true;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    render(() => <Toaster />);
    toast("Read me", { duration: 40 });
    flush();
    await after(60);
    flush();
    expect(toasts()).toHaveLength(1);

    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    await after(60);
    flush();
    expect(toasts()).toHaveLength(0);
    Reflect.deleteProperty(document, "hidden");
  });

  test("onAutoClose is told when the clock took it", async () => {
    const seen: string[] = [];
    render(() => <Toaster />);
    toast("Saved", { duration: 40, onAutoClose: () => seen.push("auto") });
    flush();
    await after(40);
    expect(seen).toEqual(["auto"]);
  });

  test("a promise that settles gets a clock, having had none while it ran", async () => {
    render(() => <Toaster duration={40} />);
    const work = toast.promise(Promise.resolve("ok"), {
      loading: "Saving",
      success: "Saved",
      error: "Failed",
    });
    expect(await work.unwrap()).toBe("ok");
    flush();
    expect(toasts()[0]?.getAttribute("data-kind")).toBe("success");
    await after(40);
    flush();
    expect(toasts()).toHaveLength(0);
  });
});

describe("toast.promise, as sonner reads an outcome", () => {
  const kinds = (): (string | null)[] => toasts().map((each) => each.getAttribute("data-kind"));

  test("a response that is not ok is the error, with its status", async () => {
    render(() => <Toaster />);
    const seen: unknown[] = [];
    const response = new Response("", { status: 503 });
    await toast.promise(Promise.resolve(response), {
      loading: "Saving",
      success: "Saved",
      error: (reason: unknown) => {
        seen.push(reason);
        return "Could not save";
      },
    });
    flush();
    expect(kinds()).toEqual(["error"]);
    expect(toasts()[0]?.textContent).toContain("Could not save");
    expect(seen).toEqual(["HTTP error! status: 503"]);
  });

  test("an Error the work resolved with is the error too", async () => {
    render(() => <Toaster />);
    const failure = new Error("quota");
    const seen: unknown[] = [];
    await toast.promise(Promise.resolve(failure), {
      loading: "Saving",
      success: "Saved",
      error: (reason: unknown) => {
        seen.push(reason);
        return "Could not save";
      },
    });
    flush();
    expect(kinds()).toEqual(["error"]);
    expect(seen).toEqual([failure]);
  });

  test("a description written once describes whichever outcome arrives", async () => {
    render(() => <Toaster />);
    await toast.promise(Promise.resolve({ name: "salama" }), {
      loading: "Saving",
      success: "Saved",
      error: "Could not save",
      description: (value: unknown) => `For ${(value as { name: string }).name}`,
    });
    flush();
    expect(kinds()).toEqual(["success"]);
    expect(document.querySelector('[data-slot="toast-description"]')?.textContent).toBe(
      "For salama",
    );
  });
});

describe("Toaster, named for a screen reader", () => {
  test("customAriaLabel is the whole label, in place of the one it would build", () => {
    render(() => <Toaster customAriaLabel="Updates" containerAriaLabel="Notifications" />);
    expect(document.querySelector('[data-slot="toaster"]')?.getAttribute("aria-label")).toBe(
      "Updates",
    );
  });
});

describe("toast, the calls", () => {
  test("message is the plain one", () => {
    render(() => <Toaster />);
    toast.message("Saved", { description: "Three files" });
    flush();
    expect(toasts()[0]?.getAttribute("data-kind")).toBe("default");
    expect(toasts()[0]?.textContent).toContain("Three files");
  });

  test("the type is upstream's attribute, beside the kind", () => {
    render(() => <Toaster />);
    toast.warning("Careful");
    flush();
    expect(toasts()[0]?.getAttribute("data-type")).toBe("warning");
    expect(toasts()[0]?.getAttribute("data-kind")).toBe("warning");
  });

  test("an id that is already up is updated, not stacked", () => {
    render(() => <Toaster />);
    const first = toast("Saving", { id: "save" });
    toast("Other");
    const second = toast.success("Saved", { id: "save" });
    flush();
    expect(first).toBe("save");
    expect(second).toBe("save");
    expect(titles()).toEqual(["Saved", "Other"]);
    expect(toasts()[0]?.getAttribute("data-kind")).toBe("success");
  });

  test("loading and then success on one id is how work is followed by hand", async () => {
    render(() => <Toaster duration={40} />);
    const id = toast.loading("Saving");
    flush();
    await after(40);
    flush();
    expect(toasts()).toHaveLength(1);
    toast.success("Saved", { id });
    flush();
    expect(toasts()).toHaveLength(1);
    await after(40);
    flush();
    expect(toasts()).toHaveLength(0);
  });

  test("dismiss takes one by id, and all of them without one", () => {
    render(() => <Toaster />);
    const id = toast("one");
    toast("two");
    toast("three");
    flush();
    toast.dismiss(id);
    flush();
    expect(titles()).toEqual(["two", "three"]);
    toast.dismiss();
    flush();
    expect(toasts()).toHaveLength(0);
  });

  test("custom draws what it is given, and is handed the id to dismiss by", async () => {
    render(() => <Toaster />);
    const given: (number | string)[] = [];
    const id = toast.custom((own) => {
      given.push(own);
      return (
        <button type="button" data-testid="mine" onClick={() => toast.dismiss(own)}>
          Mine
        </button>
      );
    });
    flush();
    expect(given).toEqual([id]);
    const mine = document.querySelector('[data-testid="mine"]') as HTMLElement;
    expect(toasts()[0]?.contains(mine)).toBe(true);
    // Nothing of the default toast is drawn around it.
    expect(toasts()[0]?.querySelector('[data-slot="toast-title"]')).toBeNull();
    expect(toasts()[0]?.getAttribute("data-styled")).toBe("false");
    await user.click(mine);
    flush();
    expect(toasts()).toHaveLength(0);
  });

  test("a title or a description can be built rather than written", () => {
    render(() => <Toaster />);
    toast(() => <em data-testid="built">Saved</em>, {
      description: () => <a href="https://example.com/files">Three files</a>,
    });
    flush();
    expect(
      document.querySelector('[data-slot="toast-title"] [data-testid="built"]'),
    ).not.toBeNull();
    expect(document.querySelector('[data-slot="toast-description"] a')?.getAttribute("href")).toBe(
      "https://example.com/files",
    );
  });

  test("what is up, and what has been, can both be read", () => {
    render(() => <Toaster />);
    const before = toast.getHistory().length;
    const id = toast("one");
    toast("two");
    flush();
    toast.dismiss(id);
    flush();
    expect(toast.getToasts().map((each) => each.title)).toEqual(["two"]);
    expect(toast.getHistory().length).toBe(before + 2);
  });
});

describe("toast, its buttons", () => {
  test("an action and a cancel are both buttons, in that order of weight", () => {
    render(() => <Toaster />);
    toast("Deleted", {
      action: { label: "Undo", onClick: () => {} },
      cancel: { label: "Keep", onClick: () => {} },
    });
    flush();
    const action = document.querySelector('[data-slot="toast-action"]') as HTMLElement;
    const cancel = document.querySelector('[data-slot="toast-cancel"]') as HTMLElement;
    expect(action.tagName).toBe("BUTTON");
    expect(cancel.tagName).toBe("BUTTON");
    expect(action.textContent).toContain("Undo");
    expect(cancel.textContent).toContain("Keep");
    // Cancel first, so the action is the last thing read and the nearest edge.
    expect(cancel.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("cancel runs and dismisses", async () => {
    const seen: string[] = [];
    render(() => <Toaster />);
    toast("Deleted", {
      duration: 10_000,
      cancel: { label: "Keep", onClick: () => seen.push("kept") },
    });
    flush();
    await user.click(document.querySelector('[data-slot="toast-cancel"]') as HTMLElement);
    flush();
    expect(seen).toEqual(["kept"]);
    expect(toasts()).toHaveLength(0);
  });

  test("an action that prevents the default keeps the toast up", async () => {
    render(() => <Toaster />);
    toast("Deleted", {
      duration: 10_000,
      action: { label: "Retry", onClick: (event) => event.preventDefault() },
    });
    flush();
    await user.click(document.querySelector('[data-slot="toast-action"]') as HTMLElement);
    flush();
    expect(toasts()).toHaveLength(1);
  });

  test("the close button can be turned off for the toaster and back on for a toast", () => {
    render(() => <Toaster closeButton={false} />);
    toast("one");
    toast("two", { closeButton: true });
    flush();
    expect(toasts()[0]?.querySelector('[data-slot="toast-close"]')).toBeNull();
    expect(toasts()[1]?.querySelector('[data-slot="toast-close"]')).not.toBeNull();
  });

  test("a toast that is not dismissible has no close button", () => {
    render(() => <Toaster />);
    toast("Stay", { dismissible: false });
    flush();
    expect(toasts()[0]?.querySelector('[data-slot="toast-close"]')).toBeNull();
    expect(toasts()[0]?.getAttribute("data-dismissible")).toBe("false");
  });

  test("the close button says what it does", () => {
    render(() => <Toaster />);
    toast("Saved");
    flush();
    expect(document.querySelector('[data-slot="toast-close"]')?.getAttribute("aria-label")).toBe(
      "Close toast",
    );
  });
});

describe("toast, how it looks", () => {
  test("each kind draws its icon, and a plain one draws none", () => {
    render(() => <Toaster />);
    toast("plain");
    toast.success("yes");
    toast.loading("wait");
    flush();
    expect(toasts()[0]?.querySelector('[data-slot="toast-icon"]')).toBeNull();
    expect(toasts()[1]?.querySelector('[data-slot="toast-icon"] svg')).not.toBeNull();
    // The spinner is a status with a name, so the wait is announced.
    expect(toasts()[2]?.querySelector('[data-slot="toast-icon"] [role="status"]')).not.toBeNull();
  });

  test("a toast can bring its own icon, and the toaster can replace a kind's", () => {
    render(() => <Toaster icons={{ success: () => <span data-testid="tick">ok</span> }} />);
    toast.success("yes");
    toast("mine", { icon: () => <span data-testid="own">!</span> });
    flush();
    expect(toasts()[0]?.querySelector('[data-testid="tick"]')).not.toBeNull();
    expect(toasts()[1]?.querySelector('[data-testid="own"]')).not.toBeNull();
  });

  test("richColors is an attribute the kind's colours select on", () => {
    render(() => <Toaster richColors />);
    toast.error("No");
    toast("plain", { richColors: false });
    flush();
    expect(toasts()[0]?.getAttribute("data-rich-colors")).toBe("true");
    expect(toasts()[1]?.getAttribute("data-rich-colors")).toBe("false");
    const rules = rulesFor([...(toasts()[0]?.classList ?? [])].join(" "));
    expect(rules).toContain('[data-rich-colors="true"][data-type="error"]');
    expect(rules).toContain("var(--error-bg)");
  });

  test("a toast's own class lands on the toast", () => {
    render(() => <Toaster toastOptions={{ class: "every" }} />);
    toast("Saved", { class: "mine" });
    flush();
    expect(toasts()[0]?.classList.contains("mine")).toBe(true);
    expect(toasts()[0]?.classList.contains("every")).toBe(true);
  });

  test("it is placed with logical sides, so a right-to-left page mirrors it", () => {
    render(() => <Toaster />);
    toast("Saved", { action: { label: "Undo", onClick: () => {} } });
    flush();
    // A marker class such as `group/toast` names no rule of its own, and
    // `rulesFor` would answer it with every component's `.group …` selector.
    const rulesOf = (slot: string): string =>
      rulesFor(
        [...(document.querySelector(`[data-slot="${slot}"]`)?.classList ?? [])]
          .filter((name) => !/^(group|peer)(\/|$)/.test(name))
          .join(" "),
      );
    expect(rulesOf("toaster-list")).toContain("inset-inline-end: var(--offset-right)");
    expect(rulesOf("toaster-list")).toContain("inset-inline-start: var(--offset-left)");
    expect(rulesOf("toast-action")).toContain("margin-inline-start: auto");
    for (const slot of ["toaster-list", "toast", "toast-action", "toast-close"]) {
      const rules = rulesOf(slot);
      expect(rules, slot).not.toMatch(/margin-(left|right):/);
      expect(rules, slot).not.toMatch(/[{;\s](left|right):/);
    }
  });
});

describe("toast, swiping it away", () => {
  const drag = async (target: HTMLElement, to: { x?: number; y?: number }, pause = 0) => {
    await user.pointerDown(target, { clientX: 0, clientY: 0 });
    await user.pointerMove(target, { clientX: to.x ?? 0, clientY: to.y ?? 0 });
    flush();
    if (pause > 0) await after(pause);
  };

  test("dragged far enough toward its edge, letting go dismisses it", async () => {
    const seen: string[] = [];
    render(() => <Toaster />);
    toast("Saved", { duration: 10_000, onDismiss: () => seen.push("gone") });
    flush();
    const target = toasts()[0] as HTMLElement;
    await drag(target, { y: 60 });
    expect(target.getAttribute("data-swiping")).toBe("true");
    expect(target.style.getPropertyValue("--swipe-amount-y")).toBe("60px");
    await user.pointerUp(target, { clientY: 60 });
    flush();
    expect(seen).toEqual(["gone"]);
    expect(toasts()).toHaveLength(0);
  });

  test("a bottom-right toast also leaves to the right", async () => {
    render(() => <Toaster />);
    toast("Saved", { duration: 10_000 });
    flush();
    const target = toasts()[0] as HTMLElement;
    await drag(target, { x: 60 });
    await user.pointerUp(target, { clientX: 60 });
    flush();
    expect(toasts()).toHaveLength(0);
  });

  test("short and slow, it stays and goes back", async () => {
    render(() => <Toaster />);
    toast("Saved", { duration: 10_000 });
    flush();
    const target = toasts()[0] as HTMLElement;
    await drag(target, { y: 20 }, 300);
    await user.pointerUp(target, { clientY: 20 });
    flush();
    expect(toasts()).toHaveLength(1);
    expect(target.getAttribute("data-swiping")).toBe("false");
    expect(target.style.getPropertyValue("--swipe-amount-y")).toBe("0px");
  });

  test("away from its edge it does not leave", async () => {
    render(() => <Toaster />);
    toast("Saved", { duration: 10_000 });
    flush();
    const target = toasts()[0] as HTMLElement;
    await drag(target, { y: -200 }, 300);
    await user.pointerUp(target, { clientY: -200 });
    flush();
    expect(toasts()).toHaveLength(1);
  });

  test("the toaster can say which ways are allowed", async () => {
    render(() => <Toaster swipeDirections={["left"]} />);
    toast("Saved", { duration: 10_000 });
    flush();
    const target = toasts()[0] as HTMLElement;
    await drag(target, { x: -60 });
    await user.pointerUp(target, { clientX: -60 });
    flush();
    expect(toasts()).toHaveLength(0);
  });

  test("one that is not dismissible does not follow the pointer", async () => {
    render(() => <Toaster />);
    toast("Stay", { duration: 10_000, dismissible: false });
    flush();
    const target = toasts()[0] as HTMLElement;
    await drag(target, { y: 60 });
    expect(target.getAttribute("data-swiping")).toBe("false");
    await user.pointerUp(target, { clientY: 60 });
    flush();
    expect(toasts()).toHaveLength(1);
  });

  test("a press that starts on a button belongs to the button", async () => {
    render(() => <Toaster />);
    toast("Deleted", { duration: 10_000, action: { label: "Undo", onClick: () => {} } });
    flush();
    const action = document.querySelector('[data-slot="toast-action"]') as HTMLElement;
    await user.pointerDown(action, { clientX: 0, clientY: 0 });
    await user.pointerMove(action, { clientY: 60 });
    flush();
    expect(toasts()[0]?.getAttribute("data-swiping")).toBe("false");
    await user.pointerUp(action, { clientY: 60 });
  });
});

describe("Toaster, for a keyboard and a screen reader", () => {
  test("the region reads additions one at a time", () => {
    render(() => <Toaster />);
    expect(region().getAttribute("aria-atomic")).toBe("false");
    expect(region().getAttribute("aria-relevant")).toBe("additions text");
    // Reachable by script and by the shortcut, without being a tab stop.
    expect(region().getAttribute("tabindex")).toBe("-1");
  });

  test("the shortcut is declared, and the label can be changed", () => {
    render(() => <Toaster containerAriaLabel="Alerts" />);
    expect(region().getAttribute("aria-label")).toBe("Alerts");
    expect(region().getAttribute("aria-keyshortcuts")).toBe("Alt+T");
  });

  test("a toast is a tab stop, so it can be reached and read", () => {
    render(() => <Toaster />);
    toast("Saved");
    flush();
    expect(toasts()[0]?.getAttribute("tabindex")).toBe("0");
  });

  test("Alt+T moves focus to the toasts and opens the stack", async () => {
    render(() => (
      <>
        <button type="button" data-testid="outside">
          Outside
        </button>
        <Toaster />
      </>
    ));
    toast("one", { duration: 10_000 });
    toast("two", { duration: 10_000 });
    flush();
    const outside = document.querySelector('[data-testid="outside"]') as HTMLElement;
    outside.focus();
    await user.key("t", { altKey: true });
    flush();
    expect(lists()[0]?.contains(document.activeElement)).toBe(true);
    expect(toasts()[0]?.getAttribute("data-expanded")).toBe("true");

    // Escape gives the keyboard back to where it was.
    await user.keyboard("{Escape}");
    flush();
    expect(document.activeElement).toBe(outside);
    expect(toasts()[0]?.getAttribute("data-expanded")).toBe("false");
  });

  test("tabbing out of the toasts gives focus back to where the keyboard was", async () => {
    render(() => (
      <>
        <button type="button" data-testid="before">
          Before
        </button>
        <Toaster />
        <button type="button" data-testid="after">
          After
        </button>
      </>
    ));
    toast("Saved", { duration: 10_000 });
    flush();
    const before = document.querySelector('[data-testid="before"]') as HTMLElement;
    before.focus();
    await user.key("t", { altKey: true });
    flush();
    expect(lists()[0]?.contains(document.activeElement)).toBe(true);

    const toaster = document.querySelector('[data-slot="toaster"]') as HTMLElement;
    for (let step = 0; step < 6 && toaster.contains(document.activeElement); step++) {
      await user.tab();
      flush();
    }
    await Promise.resolve();
    expect(document.activeElement).toBe(before);
  });

  test("a pointer that leaves the toasts takes focus with it", async () => {
    render(() => (
      <>
        <button type="button" data-testid="before">
          Before
        </button>
        <Toaster />
        <button type="button" data-testid="after">
          After
        </button>
      </>
    ));
    toast("Saved", { duration: 10_000 });
    flush();
    const before = document.querySelector('[data-testid="before"]') as HTMLElement;
    const elsewhere = document.querySelector('[data-testid="after"]') as HTMLElement;
    before.focus();
    await user.click(toasts()[0] as HTMLElement);
    await user.click(elsewhere);
    flush();
    expect(document.activeElement).toBe(elsewhere);
  });

  test("focus inside stops the clock, like a pointer does", async () => {
    render(() => <Toaster />);
    toast("Read me", { duration: 60 });
    flush();
    (toasts()[0] as HTMLElement).focus();
    await after(80);
    flush();
    expect(toasts()).toHaveLength(1);
  });

  test("an error interrupts, and nothing else does", () => {
    render(() => <Toaster />);
    toast("Saved");
    toast.error("Failed", { priority: "high" });
    flush();
    expect(toasts()[0]?.hasAttribute("aria-live")).toBe(false);
    expect(toasts()[1]?.getAttribute("aria-live")).toBe("assertive");
  });

  test("dismissing the toast that had focus hands it to the next one", async () => {
    render(() => <Toaster />);
    toast("one", { duration: 10_000 });
    toast("two", { duration: 10_000 });
    flush();
    const close = toasts()[1]?.querySelector('[data-slot="toast-close"]') as HTMLElement;
    close.focus();
    await user.click(close);
    flush();
    expect(toasts()).toHaveLength(1);
    expect(document.activeElement).toBe(toasts()[0] as HTMLElement);
  });
});

/**
 * Last in the file: the history is the module's own and this fills it, and a
 * test counting what two more toasts add has to run before it is full.
 */
describe("toast, what it remembers", () => {
  test("the history keeps the last hundred and lets the rest go", () => {
    const before = toast.getHistory().length;
    for (let index = 0; index < 100 + 5 - before; index += 1) toast(`note ${String(index)}`);
    for (let index = 0; index < before; index += 1) toast("more");
    expect(toast.getHistory()).toHaveLength(100);
    expect(toast.getHistory().at(-1)?.title).toBe(before === 0 ? "note 104" : "more");
  });
});
