import { describe, expect, test } from "bun:test";
import { collectCss } from "@barqjs/css";
import { render, screen } from "@barqjs/testing";

import { Alert, AlertDescription, AlertTitle, alertVariants } from "./alert.tsx";
import { AspectRatio } from "./aspect-ratio.tsx";
import { Badge, badgeVariants } from "./badge.tsx";
import { Kbd, KbdGroup } from "./kbd.tsx";
import { Separator } from "./separator.tsx";
import { Skeleton } from "./skeleton.tsx";
import { Spinner } from "./spinner.tsx";

/** Every rule a class produced, so a test asserts on the CSS rather than the name. */
function rulesFor(className: string): string {
  const mentions = new RegExp(`\\.${className}(?![\\w-])`);
  return collectCss()
    .split("@layer barq.ui{")
    .filter((chunk) => mentions.test(chunk))
    .join("\n");
}

describe("Alert", () => {
  test("is announced, and names its variant", () => {
    render(() => (
      <Alert variant="destructive">
        <AlertTitle>Payment failed</AlertTitle>
        <AlertDescription>The card was declined.</AlertDescription>
      </Alert>
    ));
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-slot")).toBe("alert");
    expect(alert.getAttribute("data-variant")).toBe("destructive");
    expect(screen.getByText("Payment failed").getAttribute("data-slot")).toBe("alert-title");
    expect(screen.getByText("The card was declined.").getAttribute("data-slot")).toBe(
      "alert-description",
    );
  });

  test("the destructive variant colours the text and the default does not", () => {
    const [, destructive] = alertVariants({ variant: "destructive" }).split(" ");
    const [, plain] = alertVariants({ variant: "default" }).split(" ");
    expect(rulesFor(destructive ?? "")).toContain("color: var(--destructive)");
    expect(rulesFor(plain ?? "")).toContain("color: var(--card-foreground)");
  });

  test("a caller's role wins over the default", () => {
    render(() => <Alert role="status">a</Alert>);
    expect(screen.getByRole("status")).toBeTruthy();
  });
});

describe("Badge", () => {
  test("is a span, and an anchor once it has an href", () => {
    const { container } = render(() => (
      <>
        <Badge>New</Badge>
        <Badge href="/tags/rust">rust</Badge>
      </>
    ));
    const badges = [...container.querySelectorAll('[data-slot="badge"]')];
    expect(badges.map((node) => node.tagName.toLowerCase())).toEqual(["span", "a"]);
    expect(badges[1]?.getAttribute("href")).toBe("/tags/rust");
  });

  test("the hover rules only apply when it is a link", () => {
    const [, variant] = badgeVariants({ variant: "outline" }).split(" ");
    expect(rulesFor(variant ?? "")).toContain(`a.${variant}:hover`);
  });
});

describe("Separator", () => {
  test("has the separator role and says which way it runs", () => {
    render(() => <Separator orientation="vertical" />);
    const rule = screen.getByRole("separator");
    expect(rule.getAttribute("data-orientation")).toBe("vertical");
    expect(rule.getAttribute("data-slot")).toBe("separator");
  });

  test("the reset's own hr border is removed, so there is one line and not two", () => {
    render(() => <Separator />);
    const classes = screen.getByRole("separator").className.split(" ");
    expect(classes.map(rulesFor).join("")).toContain("border: 0");
  });
});

describe("Skeleton, Kbd and Spinner", () => {
  test("a skeleton is a slot with no size of its own", () => {
    const { container } = render(() => <Skeleton />);
    const node = container.querySelector('[data-slot="skeleton"]')!;
    expect(rulesFor(node.className.split(" ")[0] ?? "")).not.toContain("width");
    expect(rulesFor(node.className.split(" ")[0] ?? "")).toContain(
      "animation: var(--animate-pulse)",
    );
  });

  test("a key renders as <kbd> inside a group", () => {
    const { container } = render(() => (
      <KbdGroup>
        <Kbd>K</Kbd>
      </KbdGroup>
    ));
    expect(container.querySelector('[data-slot="kbd-group"]')?.tagName.toLowerCase()).toBe("kbd");
    expect(container.querySelector('[data-slot="kbd"]')?.textContent).toBe("K");
  });

  test("a spinner is announced with a name", () => {
    render(() => <Spinner />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });

  test("the spinner's name is the caller's when it gives one", () => {
    render(() => <Spinner label="Uploading" />);
    expect(screen.getByRole("status", { name: "Uploading" })).toBeTruthy();
  });
});

describe("AspectRatio", () => {
  test("the ratio is a custom property, so changing it writes no new CSS", () => {
    const { container } = render(() => (
      <AspectRatio ratio={16 / 9}>
        <div>cover</div>
      </AspectRatio>
    ));
    const box = container.querySelector('[data-slot="aspect-ratio"]') as HTMLElement;
    expect(box.style.getPropertyValue("--barq-aspect-ratio")).toBe(String(16 / 9));
    expect(rulesFor(box.className.split(" ")[0] ?? "")).toContain(
      "aspect-ratio: var(--barq-aspect-ratio, 1)",
    );
  });
});
