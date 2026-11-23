import { describe, expect, test } from "bun:test";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { Status } from "./status.tsx";

describe("Status", () => {
  test("says the state in words, with the dot hidden from assistive tech", async () => {
    render(() => (
      <Status tone="success" pulse>
        Operational
      </Status>
    ));
    const status = screen.getByText("Operational");
    expect(status.getAttribute("data-slot")).toBe("status");
    expect(status.getAttribute("data-tone")).toBe("success");
    const dot = status.querySelector('[data-slot="status-dot"]');
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(dot?.hasAttribute("data-pulse")).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("gives each tone and variant its own classes, and keeps the caller's", () => {
    render(() => (
      <>
        <Status tone="danger" variant="subtle" class="mine">
          Down
        </Status>
        <Status>Unknown</Status>
      </>
    ));
    const down = screen.getByText("Down");
    const unknown = screen.getByText("Unknown");
    expect(down.className).toContain("mine");
    expect(down.getAttribute("data-variant")).toBe("subtle");
    expect(unknown.getAttribute("data-tone")).toBe("neutral");
    expect(down.className).not.toBe(unknown.className);
  });
});
