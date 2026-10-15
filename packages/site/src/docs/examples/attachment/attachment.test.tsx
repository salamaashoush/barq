import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import AttachmentDemo from "./attachment-demo.tsx";
import AttachmentTriggerDemo from "./attachment-trigger.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("the attachment examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("attachment")).toEqual([]);
  });

  test("an attachment names its file in its title slot", () => {
    render(() => <AttachmentDemo />);
    const titles = [...document.querySelectorAll('[data-slot="attachment-title"]')];
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every((title) => (title.textContent ?? "") !== "")).toBe(true);
  });

  test("the trigger opens the preview dialog and the actions stay their own buttons", async () => {
    render(() => <AttachmentTriggerDemo />);
    expect(screen.getByRole("button", { name: "Copy link" })).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Preview research-summary.pdf" }));
    await settle();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("The attachment trigger fills the card");

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
