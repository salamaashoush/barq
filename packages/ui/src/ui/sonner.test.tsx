import { afterEach, describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, user } from "@barqjs/testing";

import { Toaster, toast } from "./sonner.tsx";

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
