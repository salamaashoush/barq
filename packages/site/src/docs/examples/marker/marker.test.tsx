import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import MarkerDemo from "./marker-demo.tsx";
import MarkerLinkButton from "./marker-link-button.tsx";

describe("the marker examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("marker")).toEqual([]);
  });

  test("a marker holds its content in its own slot", () => {
    render(() => <MarkerDemo />);
    const markers = [...document.querySelectorAll('[data-slot="marker"]')];
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((marker) => marker.querySelector('[data-slot="marker-content"]'))).toBe(
      true,
    );
  });

  test("a marker's content can be a link or a button that acts", async () => {
    render(() => <MarkerLinkButton />);
    expect(screen.getByRole("link", { name: "View the pull request" }).getAttribute("href")).toBe(
      "#links-and-buttons",
    );

    await user.click(screen.getByRole("button", { name: "Revert this change" }));
    flush();
    expect(screen.getByRole("button", { name: "Change reverted" })).not.toBeNull();
  });
});
