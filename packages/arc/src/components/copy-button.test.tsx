import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { ariaViolations, render, screen, tick, user, waitFor } from "@barqjs/testing";

import { CopyButton } from "./copy-button.tsx";

const written: string[] = [];
let refuse = false;
const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");

beforeEach(() => {
  written.length = 0;
  refuse = false;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string): Promise<void> => {
        if (refuse) return Promise.reject(new Error("refused"));
        written.push(text);
        return Promise.resolve();
      },
    },
  });
});

afterEach(() => {
  if (original === undefined) {
    Reflect.deleteProperty(navigator, "clipboard");
  } else {
    Object.defineProperty(navigator, "clipboard", original);
  }
});

function status(): HTMLElement {
  return screen.getByRole("status");
}

describe("CopyButton", () => {
  test("copies its value, shows it did, says so, and settles back", async () => {
    const copied: string[] = [];
    render(() => (
      <CopyButton
        value="tok_example"
        label="Copy the API key"
        resetAfter={30}
        onCopy={(value) => copied.push(value)}
      />
    ));
    const button = screen.getByRole("button", { name: "Copy the API key" });
    expect(status().textContent).toBe("");
    expect(button.hasAttribute("data-copied")).toBe(false);

    await user.click(button);
    await tick();
    flush();
    expect(written).toEqual(["tok_example"]);
    expect(copied).toEqual(["tok_example"]);
    expect(button.hasAttribute("data-copied")).toBe(true);
    expect(status().textContent).toBe("Copied");
    expect(status().getAttribute("data-slot")).toBe("copy-button-status");

    await waitFor(() => {
      flush();
      expect(button.hasAttribute("data-copied")).toBe(false);
    });
    expect(status().textContent).toBe("");
  });

  test("works from the keyboard", async () => {
    render(() => <CopyButton value="https://example.com/invite" />);
    const button = screen.getByRole("button", { name: "Copy" });
    button.focus();
    await user.keyboard("{Enter}");
    await tick();
    await user.keyboard(" ");
    await tick();
    expect(written).toEqual(["https://example.com/invite", "https://example.com/invite"]);
  });

  test("says so when the browser refuses", async () => {
    refuse = true;
    render(() => <CopyButton value="secret" failedLabel="Copy failed" />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await tick();
    flush();
    expect(status().textContent).toBe("Copy failed");
    expect(screen.getByRole("button").hasAttribute("data-copied")).toBe(false);
  });

  test("with text of its own, the text names it", async () => {
    render(() => <CopyButton value="https://example.com">Copy link</CopyButton>);
    const button = screen.getByRole("button", { name: "Copy link" });
    expect(button.getAttribute("aria-label")).toBeNull();
    expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });
});
