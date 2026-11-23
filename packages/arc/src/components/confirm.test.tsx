import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { ConfirmHost, confirm } from "./confirm.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("confirm", () => {
  test("resolves true when the reader confirms, and closes", async () => {
    render(() => <ConfirmHost />);
    const answer = confirm({
      title: "Delete the check?",
      description: "Its history goes with it.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    await settle();
    expect(screen.getByRole("alertdialog")).toBeDefined();
    expect(screen.getByText("Its history goes with it.")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await answer).toBe(true);
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("resolves false on cancel", async () => {
    render(() => <ConfirmHost />);
    const answer = confirm({ title: "Leave without saving?" });
    await settle();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await answer).toBe(false);
  });

  test("answers an open question false when a second one is asked", async () => {
    render(() => <ConfirmHost />);
    const first = confirm({ title: "First?" });
    await settle();
    const second = confirm({ title: "Second?" });
    expect(await first).toBe(false);
    await settle();
    expect(screen.getByText("Second?")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await second).toBe(true);
  });
});
