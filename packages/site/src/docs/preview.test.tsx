import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";
import { useDirection } from "@barqjs/ui";

import { ComponentPreview } from "./preview.tsx";

function Reads() {
  const direction = useDirection();
  return <output>{direction()}</output>;
}

const frame = (): HTMLElement => document.querySelector('[data-slot="preview"]') as HTMLElement;

describe("the preview card's direction toggle", () => {
  test("starts left to right, on the element and in scope", () => {
    render(() => (
      <ComponentPreview>
        <Reads />
      </ComponentPreview>
    ));
    expect(frame().getAttribute("dir")).toBe("ltr");
    expect(screen.getByRole("status").textContent).toBe("ltr");
    expect(screen.getByRole("button", { name: "Right to left" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  test("pressing it turns the example, and pressing again turns it back", async () => {
    render(() => (
      <ComponentPreview>
        <Reads />
      </ComponentPreview>
    ));
    const toggle = screen.getByRole("button", { name: "Right to left" });

    await user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(frame().getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("status").textContent).toBe("rtl");
    expect(toggle.closest("[dir]")).toBeNull();

    await user.click(toggle);
    flush();
    expect(frame().getAttribute("dir")).toBe("ltr");
    expect(screen.getByRole("status").textContent).toBe("ltr");
  });

  test("an example that names its own direction gets no toggle and no `dir`", () => {
    render(() => (
      <ComponentPreview rtl>
        <Reads />
      </ComponentPreview>
    ));
    expect(screen.queryByRole("button", { name: "Right to left" })).toBeNull();
    expect(frame().hasAttribute("dir")).toBe(false);
  });
});
