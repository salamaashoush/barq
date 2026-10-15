import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import DialogCloseButton from "./dialog-close-button.tsx";
import DialogDemo from "./dialog-demo.tsx";
import DialogNoCloseButton from "./dialog-no-close-button.tsx";
import DialogRtl from "./dialog-rtl.tsx";
import DialogScrollableContent from "./dialog-scrollable-content.tsx";
import DialogStickyFooter from "./dialog-sticky-footer.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const content = (): HTMLElement | null => document.querySelector('[data-slot="dialog-content"]');

async function press(name: string): Promise<void> {
  await user.click(screen.getByRole("button", { name }));
  await settle();
}

async function escape(): Promise<void> {
  await user.keyboard("{Escape}");
  await settle();
}

describe("the dialog examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("dialog")).toEqual([]);
  });

  test("the trigger opens a named dialog holding both fields, and Cancel closes it", async () => {
    render(() => <DialogDemo />);
    expect(content()).toBeNull();

    await press("Open Dialog");
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBe(
      screen.getByText("Edit profile").getAttribute("id"),
    );
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Salama");
    expect(screen.getByLabelText<HTMLInputElement>("Username").value).toBe("@salama");

    await press("Cancel");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a DialogClose of your own closes the dialog beside the corner one", async () => {
    render(() => <DialogCloseButton />);
    await press("Share");
    const link = screen.getByLabelText("Link") as HTMLInputElement;
    expect(link.value).toBe("https://example.com/docs/installation");
    expect(link.readOnly).toBe(true);

    const closers = [...document.querySelectorAll<HTMLElement>('[data-slot="dialog-close"]')];
    expect(closers).toHaveLength(2);
    const own = closers.find((each) => each.getAttribute("data-variant") === "default");
    expect(own?.textContent).toBe("Close");
    await user.click(own as HTMLElement);
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("showCloseButton={false} leaves no close button, and Escape still closes", async () => {
    render(() => <DialogNoCloseButton />);
    await press("No Close Button");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.querySelector('[data-slot="dialog-close"]')).toBeNull();

    await escape();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("the sticky footer sits after ten scrolling paragraphs", async () => {
    render(() => <DialogStickyFooter />);
    await press("Sticky Footer");
    expect(content()?.querySelectorAll("p:not([data-slot])")).toHaveLength(10);
    const footer = content()?.querySelector('[data-slot="dialog-footer"]');
    expect(footer?.textContent).toBe("Close");

    await user.click(footer?.querySelector("button") as HTMLElement);
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("the scrollable dialog holds ten paragraphs and no footer", async () => {
    render(() => <DialogScrollableContent />);
    await press("Scrollable Content");
    expect(content()?.querySelectorAll("p:not([data-slot])")).toHaveLength(10);
    expect(content()?.querySelector('[data-slot="dialog-footer"]')).toBeNull();

    await escape();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("the right-to-left example names its direction around the trigger and inside the dialog", async () => {
    render(() => <DialogRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="button"]')).not.toBeNull();

    await press("فتح الحوار");
    expect(content()?.querySelector('[dir="rtl"] [data-slot="dialog-title"]')?.textContent).toBe(
      "تعديل الملف الشخصي",
    );

    await press("إلغاء");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
