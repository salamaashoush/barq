import { describe, expect, test } from "bun:test";
import { render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Button, buttonVariants } from "./button.tsx";

/** The rules a class produced, so a test can assert on the CSS and not the name. */

describe("Button", () => {
  test("renders a button with its text", () => {
    render(() => <Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  test("carries the slot and the chosen variant as data attributes", () => {
    render(() => (
      <Button variant="outline" size="sm">
        Save
      </Button>
    ));
    const button = screen.getByRole("button");
    expect(button.getAttribute("data-slot")).toBe("button");
    expect(button.getAttribute("data-variant")).toBe("outline");
    expect(button.getAttribute("data-size")).toBe("sm");
  });

  test("defaults are named in the attributes, not left blank", () => {
    render(() => <Button>Save</Button>);
    const button = screen.getByRole("button");
    expect(button.getAttribute("data-variant")).toBe("default");
    expect(button.getAttribute("data-size")).toBe("default");
  });

  test("a caller's class is kept alongside the variant's", () => {
    render(() => <Button class="mine">Save</Button>);
    const classes = screen.getByRole("button").className.split(" ");
    expect(classes).toContain("mine");
    expect(classes.length).toBeGreaterThan(1);
  });

  test("a wrapper can rename the slot", () => {
    // `data-slot="button"` was written after the spread and won, so
    // `AlertDialogAction` and every wrapper like it rendered as a plain button
    // and `[data-slot="alert-dialog-action"]` selected nothing.
    render(() => <Button data-slot="alert-dialog-action">Delete</Button>);
    expect(screen.getByRole("button").getAttribute("data-slot")).toBe("alert-dialog-action");
  });

  test("onPress fires", async () => {
    const presses: string[] = [];
    render(() => <Button onPress={() => presses.push("pressed")}>Save</Button>);
    await user.click(screen.getByRole("button"));
    expect(presses).toEqual(["pressed"]);
  });

  test("isDisabled disables the element and stops the press", async () => {
    const presses: string[] = [];
    render(() => (
      <Button isDisabled onPress={() => presses.push("pressed")}>
        Save
      </Button>
    ));
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.click(button);
    expect(presses).toEqual([]);
  });
});

describe("buttonVariants", () => {
  test("the defaults are applied when nothing is asked for", () => {
    expect(buttonVariants()).toBe(buttonVariants({ variant: "default", size: "default" }));
  });

  test("the variant's own class differs per variant", () => {
    expect(buttonVariants({ variant: "ghost" })).not.toBe(buttonVariants({ variant: "link" }));
  });

  /**
   * `group/button` is the one class here with no rule of its own, and that is
   * what a marker IS: upstream's styles compile to `.group\/button:has(…)`, so
   * the string has to be on the element for their selector to match, and
   * nothing in this package ever declares it. Every other class is an atom.
   */
  test("every rule it produces is inside the package's layer", () => {
    const classes = buttonVariants({ variant: "destructive", size: "lg" }).split(" ");
    expect(classes.length).toBeGreaterThan(20);
    const markers = classes.filter((className) => !className.startsWith("a-"));
    expect(markers).toEqual(["group/button"]);
    for (const className of classes) {
      if (markers.includes(className)) continue;
      // `rulesFor` reads only what follows `@layer barq.ui{`, so a class it
      // finds is a class inside the layer.
      expect(rulesFor(className)).toContain(className);
    }
  });

  test("the size decides the height and the variant decides the colour", () => {
    const rules = rulesFor(buttonVariants({ variant: "secondary", size: "lg" }));
    expect(rules).toContain("background-color: var(--secondary)");
    // `h-9`, which is upstream's current `lg`. It was `h-10` in the older
    // registry this package was first ported from.
    expect(rules).toContain("height: calc(var(--spacing) * 9)");
    expect(rulesFor(buttonVariants({ variant: "ghost", size: "sm" }))).not.toContain(
      "background-color: var(--secondary)",
    );
  });
});
