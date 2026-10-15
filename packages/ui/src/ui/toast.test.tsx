import { afterEach, describe, expect, test } from "bun:test";
import { For, flush } from "@barqjs/core";
import { render, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import {
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  Toaster,
  createToastManager,
  toast,
  useToastManager,
  type ToastObject,
} from "./toast.tsx";

/** Long enough for a timer scheduled at `ms` to have run. */
function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + 25));
}

const all = (slot: string): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`),
];
const toasts = (): HTMLElement[] => all("toast");
const viewport = (): HTMLElement => all("toast-viewport")[0] as HTMLElement;

afterEach(() => {
  // The default manager is module-level on purpose, so one test's toasts would
  // otherwise be the next test's.
  toast.close();
  flush();
});

describe("Toaster", () => {
  test("the viewport is a labelled live region inside the portal", () => {
    render(() => <Toaster />);
    expect(viewport().getAttribute("role")).toBe("region");
    expect(viewport().getAttribute("aria-live")).toBe("polite");
    expect(viewport().getAttribute("aria-atomic")).toBe("false");
    expect(viewport().getAttribute("aria-relevant")).toBe("additions text");
    expect(viewport().getAttribute("aria-label")).toBe("Notifications");
    // Reachable by the shortcut, without being a stop on the way through.
    expect(viewport().getAttribute("tabindex")).toBe("-1");
    expect(all("toast-portal")[0]?.contains(viewport())).toBe(true);
  });

  test("add shows a toast named by its title and described by its description", () => {
    render(() => <Toaster />);
    const id = toast.add({ title: "Event created", description: "Sunday, December 3 at 9:00 AM" });
    flush();
    expect(typeof id).toBe("string");
    const [one] = toasts();
    expect(one?.getAttribute("role")).toBe("dialog");
    expect(one?.getAttribute("aria-modal")).toBe("false");
    const title = all("toast-title")[0] as HTMLElement;
    const description = all("toast-description")[0] as HTMLElement;
    expect(title.tagName).toBe("H2");
    expect(description.tagName).toBe("P");
    expect(title.textContent).toBe("Event created");
    expect(one?.getAttribute("aria-labelledby")).toBe(title.id);
    expect(one?.getAttribute("aria-describedby")).toBe(description.id);
    expect(one?.getAttribute("tabindex")).toBe("0");
  });

  test("a part with nothing to say is not drawn", () => {
    render(() => <Toaster />);
    toast.add({ description: "Event has been created." });
    flush();
    expect(all("toast-title")).toHaveLength(0);
    expect(all("toast-action")).toHaveLength(0);
    expect(toasts()[0]?.hasAttribute("aria-labelledby")).toBe(false);
  });

  test("the type is an attribute and an icon, and a plain toast has neither", () => {
    render(() => <Toaster />);
    toast.add({ description: "plain" });
    toast.add({ type: "success", description: "yes" });
    toast.add({ type: "error", description: "no" });
    flush();
    // The newest is first, which is the order a stack is read in.
    const [error, success, plain] = toasts();
    expect(plain?.hasAttribute("data-type")).toBe(false);
    expect(plain?.querySelector('[data-slot="toast-icon"]')).toBeNull();
    expect(success?.getAttribute("data-type")).toBe("success");
    expect(success?.querySelector('[data-slot="toast-icon"] svg')).not.toBeNull();
    expect(error?.getAttribute("data-type")).toBe("error");
    // The icon repeats what the text says, so it is not read twice.
    expect(error?.querySelector('[data-slot="toast-icon"] svg')?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  test("actionProps draws a button that does what it was given", async () => {
    const seen: string[] = [];
    render(() => <Toaster />);
    const id = toast.add({
      title: "Event created",
      actionProps: {
        children: "Undo",
        onClick() {
          seen.push("undone");
          toast.close(id);
        },
      },
    });
    flush();
    const action = all("toast-action")[0] as HTMLElement;
    expect(action.tagName).toBe("BUTTON");
    expect(action.textContent).toBe("Undo");
    await user.click(action);
    flush();
    expect(seen).toEqual(["undone"]);
    expect(toasts()).toHaveLength(0);
  });

  test("the close button says what it does, and does it", async () => {
    const seen: string[] = [];
    render(() => <Toaster />);
    toast.add({ title: "Saved", onClose: () => seen.push("closed") });
    flush();
    const close = all("toast-close")[0] as HTMLElement;
    expect(close.getAttribute("aria-label")).toBe("Close toast");
    await user.click(close);
    flush();
    expect(toasts()).toHaveLength(0);
    expect(seen).toEqual(["closed"]);
  });

  test("onRemove is told once it has left the page", async () => {
    const seen: string[] = [];
    render(() => <Toaster />);
    const id = toast.add({ title: "Saved", onRemove: () => seen.push("removed") });
    flush();
    expect(seen).toEqual([]);
    toast.close(id);
    flush();
    expect(seen).toEqual(["removed"]);
  });

  test("update changes one in place", () => {
    render(() => <Toaster />);
    const id = toast.add({ title: "Saving" });
    toast.add({ title: "Other" });
    flush();
    toast.update(id, { title: "Saved", type: "success" });
    flush();
    expect(all("toast-title").map((each) => each.textContent)).toEqual(["Other", "Saved"]);
    expect(toasts()[1]?.getAttribute("data-type")).toBe("success");
  });

  test("an id that is already up is not added twice", () => {
    render(() => <Toaster />);
    toast.add({ id: "save", title: "Saving" });
    toast.add({ id: "save", title: "Saved" });
    flush();
    expect(all("toast-title").map((each) => each.textContent)).toEqual(["Saved"]);
  });

  test("promise follows the work on one toast", async () => {
    render(() => <Toaster />);
    const work = toast.promise(Promise.resolve({ name: "Event" }), {
      loading: "Creating event…",
      success: (data) => `${data.name} created.`,
      error: "Could not create event.",
    });
    flush();
    expect(toasts()[0]?.getAttribute("data-type")).toBe("loading");
    expect(all("toast-description")[0]?.textContent).toBe("Creating event…");
    await work;
    flush();
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]?.getAttribute("data-type")).toBe("success");
    expect(all("toast-description")[0]?.textContent).toBe("Event created.");
  });

  test("a failed promise says so", async () => {
    render(() => <Toaster />);
    const work = toast.promise(Promise.reject(new Error("nope")), {
      loading: "Creating event…",
      success: "Created.",
      error: { title: "Failed", description: "Could not create event." },
    });
    await expect(work).rejects.toThrow("nope");
    flush();
    expect(toasts()[0]?.getAttribute("data-type")).toBe("error");
    expect(all("toast-title")[0]?.textContent).toBe("Failed");
  });
});

describe("Toaster, the clock", () => {
  test("the provider's timeout is every toast's unless it says otherwise", async () => {
    render(() => <Toaster timeout={40} />);
    toast.add({ title: "Goes" });
    toast.add({ title: "Stays", timeout: 10_000 });
    flush();
    await after(40);
    flush();
    expect(all("toast-title").map((each) => each.textContent)).toEqual(["Stays"]);
  });

  test("a timeout of zero never runs out", async () => {
    render(() => <Toaster timeout={40} />);
    toast.add({ title: "Stays", timeout: 0 });
    flush();
    await after(60);
    flush();
    expect(toasts()).toHaveLength(1);
  });

  test("a pointer over the stack stops the clock and opens it", async () => {
    render(() => <Toaster />);
    toast.add({ title: "Read me", timeout: 60 });
    flush();
    expect(viewport().hasAttribute("data-expanded")).toBe(false);
    await user.hover(toasts()[0] as HTMLElement);
    flush();
    expect(viewport().hasAttribute("data-expanded")).toBe(true);
    expect(toasts()[0]?.hasAttribute("data-expanded")).toBe(true);
    expect(all("toast-content")[0]?.hasAttribute("data-expanded")).toBe(true);
    await after(80);
    flush();
    expect(toasts()).toHaveLength(1);
    await user.unhover(toasts()[0] as HTMLElement);
    flush();
    expect(toasts()[0]?.hasAttribute("data-expanded")).toBe(false);
    await after(80);
    flush();
    expect(toasts()).toHaveLength(0);
  });
});

describe("Toaster, the stack", () => {
  test("each toast knows how far back it is", () => {
    render(() => <Toaster />);
    toast.add({ title: "one" });
    toast.add({ title: "two" });
    flush();
    const [front, behind] = toasts();
    expect(front?.style.getPropertyValue("--toast-index")).toBe("0");
    expect(behind?.style.getPropertyValue("--toast-index")).toBe("1");
    const [frontContent, behindContent] = all("toast-content");
    expect(frontContent?.hasAttribute("data-behind")).toBe(false);
    expect(behindContent?.hasAttribute("data-behind")).toBe(true);
    expect(viewport().style.getPropertyValue("--toast-frontmost-height")).toBe("0px");
  });

  test("past the limit the oldest is kept, hidden from everyone", () => {
    render(() => <Toaster limit={2} />);
    for (const title of ["one", "two", "three"]) toast.add({ title });
    flush();
    const [newest, middle, oldest] = toasts();
    expect(newest?.hasAttribute("data-limited")).toBe(false);
    expect(middle?.hasAttribute("data-limited")).toBe(false);
    expect(oldest?.hasAttribute("data-limited")).toBe(true);
    // Drawn at no opacity is still read and still a tab stop, unless it is
    // taken out of both.
    expect(oldest?.getAttribute("aria-hidden")).toBe("true");
    expect(oldest?.hasAttribute("inert")).toBe(true);
    const rules = rulesFor([...(oldest?.classList ?? [])].join(" "));
    expect(rules).toContain("[data-limited]");
  });

  test("the one behind the limit comes back when there is room", () => {
    render(() => <Toaster limit={1} />);
    toast.add({ title: "one" });
    const id = toast.add({ title: "two" });
    flush();
    expect(toasts()[1]?.hasAttribute("data-limited")).toBe(true);
    toast.close(id);
    flush();
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]?.hasAttribute("data-limited")).toBe(false);
  });

  test("it is anchored with logical sides", () => {
    render(() => <Toaster />);
    toast.add({ title: "one" });
    flush();
    for (const slot of ["toast-viewport", "toast"]) {
      const element = all(slot)[0];
      const rules = rulesFor([...(element?.classList ?? [])].join(" "));
      expect(rules, slot).toContain("inset-inline-end:");
      expect(rules, slot).not.toMatch(/[{;\s](left|right):/);
    }
  });
});

describe("Toaster, swiping", () => {
  test("down or toward the end it leaves, and says which way", async () => {
    render(() => <Toaster />);
    toast.add({ title: "one", timeout: 0 });
    flush();
    const target = toasts()[0] as HTMLElement;
    await user.pointerDown(target, { clientX: 0, clientY: 0 });
    await user.pointerMove(target, { clientX: 0, clientY: 60 });
    flush();
    expect(target.hasAttribute("data-swiping")).toBe(true);
    expect(target.style.getPropertyValue("--toast-swipe-movement-y")).toBe("60px");
    await user.pointerUp(target, { clientX: 0, clientY: 60 });
    flush();
    expect(toasts()).toHaveLength(0);
  });

  test("pulled past the threshold and brought back, it stays", async () => {
    render(() => <Toaster />);
    toast.add({ title: "one", timeout: 0 });
    flush();
    const target = toasts()[0] as HTMLElement;
    await user.pointerDown(target, { clientX: 0, clientY: 0 });
    await user.pointerMove(target, { clientX: 0, clientY: 80 });
    await user.pointerMove(target, { clientX: 0, clientY: 55 });
    await user.pointerUp(target, { clientX: 0, clientY: 55 });
    flush();
    expect(toasts()).toHaveLength(1);
    expect(target.hasAttribute("data-swiping")).toBe(false);
  });

  test("a flick that stops short stays: only how far it went decides", async () => {
    render(() => <Toaster />);
    toast.add({ title: "one", timeout: 0 });
    flush();
    const target = toasts()[0] as HTMLElement;
    await user.pointerDown(target, { clientX: 0, clientY: 0 });
    await user.pointerMove(target, { clientX: 0, clientY: 30 });
    await user.pointerUp(target, { clientX: 0, clientY: 30 });
    flush();
    expect(toasts()).toHaveLength(1);
    expect(target.hasAttribute("data-swiping")).toBe(false);
  });

  test("up is not one of its ways, so it stays", async () => {
    render(() => <Toaster />);
    toast.add({ title: "one", timeout: 0 });
    flush();
    const target = toasts()[0] as HTMLElement;
    await user.pointerDown(target, { clientX: 0, clientY: 0 });
    await user.pointerMove(target, { clientX: 0, clientY: -200 });
    await after(300);
    await user.pointerUp(target, { clientX: 0, clientY: -200 });
    flush();
    expect(toasts()).toHaveLength(1);
    expect(target.hasAttribute("data-swiping")).toBe(false);
  });
});

describe("Toaster, for a keyboard and a screen reader", () => {
  test("a high priority toast interrupts", () => {
    render(() => <Toaster />);
    toast.add({ title: "Saved" });
    toast.add({ title: "Failed", priority: "high" });
    flush();
    const [urgent, calm] = toasts();
    expect(urgent?.getAttribute("role")).toBe("alertdialog");
    expect(urgent?.getAttribute("aria-live")).toBe("assertive");
    expect(calm?.getAttribute("role")).toBe("dialog");
    expect(calm?.hasAttribute("aria-live")).toBe(false);
  });

  test("F6 moves focus to the toasts, and Escape closes the one that has it", async () => {
    render(() => (
      <>
        <button type="button" data-testid="outside">
          Outside
        </button>
        <Toaster />
      </>
    ));
    toast.add({ title: "one", timeout: 0 });
    toast.add({ title: "two", timeout: 0 });
    flush();
    const outside = document.querySelector('[data-testid="outside"]') as HTMLElement;
    outside.focus();
    await user.key("F6");
    flush();
    expect(document.activeElement).toBe(viewport());
    expect(viewport().hasAttribute("data-expanded")).toBe(true);

    const [front] = toasts();
    (front as HTMLElement).focus();
    await user.key("Escape");
    flush();
    expect(toasts()).toHaveLength(1);
    // The keyboard stays with the toasts while there is one to hold it.
    expect(document.activeElement).toBe(toasts()[0] as HTMLElement);

    await user.key("Escape");
    flush();
    expect(toasts()).toHaveLength(0);
    expect(document.activeElement).toBe(outside);
  });
});

describe("createToastManager", () => {
  test("a manager of its own is a queue of its own", () => {
    const mine = createToastManager();
    render(() => <Toaster toastManager={mine} />);
    toast.add({ title: "elsewhere" });
    mine.add({ title: "here" });
    flush();
    expect(all("toast-title").map((each) => each.textContent)).toEqual(["here"]);
    mine.close();
  });

  test("useToastManager reads the provider's manager, newest first", () => {
    const mine = createToastManager();
    let seen: readonly ToastObject[] = [];
    function Reader() {
      const manager = useToastManager();
      return (
        <button type="button" data-testid="reader" onClick={() => (seen = manager.toasts())}>
          Read
        </button>
      );
    }
    render(() => (
      <ToastProvider toastManager={mine}>
        <Reader />
      </ToastProvider>
    ));
    mine.add({ title: "one" });
    mine.add({ title: "two", type: "info" });
    flush();
    (document.querySelector('[data-testid="reader"]') as HTMLElement).click();
    expect(seen.map((each) => each.title)).toEqual(["two", "one"]);
    expect(seen[0]?.type).toBe("info");
    mine.close();
  });

  test("the hook outside a provider says what is wrong", () => {
    function Loose() {
      useToastManager();
      return <div />;
    }
    expect(() => render(() => <Loose />)).toThrow("inside a <ToastProvider>");
  });

  test("the parts compose by hand, with a swipe direction of their own", async () => {
    const mine = createToastManager();
    function List() {
      const manager = useToastManager();
      return (
        <For each={() => manager.toasts()} keyed={(each: ToastObject) => each.id}>
          {(each: () => ToastObject) => (
            <Toast toast={each()} swipeDirection="up">
              <ToastContent>
                <ToastTitle>Mine: {() => each().title as string}</ToastTitle>
                <ToastDescription />
                <ToastAction />
                <ToastClose>Dismiss</ToastClose>
              </ToastContent>
            </Toast>
          )}
        </For>
      );
    }
    render(() => (
      <ToastProvider toastManager={mine}>
        <ToastPortal>
          <ToastViewport>
            <List />
          </ToastViewport>
        </ToastPortal>
      </ToastProvider>
    ));
    mine.add({ title: "one", description: "first", timeout: 0 });
    flush();
    expect(all("toast-title")[0]?.textContent).toBe("Mine: one");
    expect(all("toast-description")[0]?.textContent).toBe("first");
    expect(all("toast-close")[0]?.textContent).toBe("Dismiss");

    const target = toasts()[0] as HTMLElement;
    await user.pointerDown(target, { clientX: 0, clientY: 0 });
    await user.pointerMove(target, { clientX: 0, clientY: -60 });
    await user.pointerUp(target, { clientX: 0, clientY: -60 });
    flush();
    expect(toasts()).toHaveLength(0);
    expect(mine.toasts()).toHaveLength(0);
  });
});
