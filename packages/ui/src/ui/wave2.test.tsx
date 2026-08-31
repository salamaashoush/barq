import { describe, expect, test } from "bun:test";
import { collectCss } from "@barqjs/css";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "./avatar.tsx";
import { Checkbox } from "./checkbox.tsx";
import { Input, Textarea } from "./input.tsx";
import { Label } from "./label.tsx";
import { Progress } from "./progress.tsx";
import { RadioGroup, RadioGroupItem } from "./radio-group.tsx";
import { Switch } from "./switch.tsx";
import { Toggle, toggleVariants } from "./toggle.tsx";

function rulesFor(className: string): string {
  const mentions = new RegExp(`\\.${className}(?![\\w-])`);
  return collectCss()
    .split("@layer barq.ui{")
    .filter((chunk) => mentions.test(chunk))
    .join("\n");
}

function slot(name: string): HTMLElement {
  const found = document.querySelector(`[data-slot="${name}"]`);
  if (found === null) throw new Error(`no [data-slot="${name}"]`);
  return found as HTMLElement;
}

describe("Label and Input", () => {
  test("a label names the control it points at", () => {
    render(() => (
      <>
        <Label for="email">Email</Label>
        <Input id="email" type="email" placeholder="you@example.com" />
      </>
    ));
    const field = screen.getByRole("textbox", { name: "Email" }) as HTMLInputElement;
    expect(field.type).toBe("email");
    expect(field.placeholder).toBe("you@example.com");
    expect(field.getAttribute("data-slot")).toBe("input");
  });

  test("typing reaches onInput", async () => {
    const seen: string[] = [];
    render(() => (
      <Input aria-label="Name" onInput={(e) => seen.push((e.target as HTMLInputElement).value)} />
    ));
    await user.type(screen.getByRole("textbox"), "ok");
    expect(seen.at(-1)).toBe("ok");
  });

  test("a textarea grows with its content rather than by measurement", () => {
    render(() => <Textarea aria-label="Notes" rows={3} />);
    const box = screen.getByRole("textbox");
    expect(box.tagName.toLowerCase()).toBe("textarea");
    expect(box.getAttribute("rows")).toBe("3");
    expect(rulesFor(box.className.split(" ")[0] ?? "")).toContain("field-sizing: content");
  });

  test("disabled reaches the element", () => {
    render(() => <Input aria-label="Name" disabled />);
    expect(screen.getByRole<HTMLInputElement>("textbox").disabled).toBe(true);
  });
});

describe("Checkbox", () => {
  test("is a real checkbox, and the box is its label", async () => {
    const changes: boolean[] = [];
    render(() => <Checkbox aria-label="Accept" onChange={(on) => changes.push(on)} />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.type).toBe("checkbox");
    await user.click(box);
    expect(changes).toEqual([true]);
    expect(slot("checkbox").getAttribute("data-selected")).toBe("");
  });

  test("shows a dash rather than a tick when indeterminate", () => {
    render(() => <Checkbox aria-label="All" isIndeterminate />);
    expect(slot("checkbox").getAttribute("data-indeterminate")).toBe("");
    // lucide's minus is one path; its check is one path with a different `d`.
    expect(slot("checkbox-indicator").querySelector("path")?.getAttribute("d")).toBe("M5 12h14");
  });

  test("the tick is hidden until it is checked", () => {
    render(() => <Checkbox aria-label="Accept" />);
    const indicator = slot("checkbox-indicator");
    expect(rulesFor(indicator.className.split(" ")[0] ?? "")).toContain("display: none");
  });

  test("selected colours the box with the primary token", () => {
    render(() => <Checkbox aria-label="Accept" defaultSelected />);
    const box = slot("checkbox");
    expect(box.getAttribute("data-selected")).toBe("");
    expect(rulesFor(box.className.split(" ")[0] ?? "")).toContain(
      "[data-selected]{border-color: var(--primary);background-color: var(--primary)",
    );
  });
});

describe("Switch", () => {
  test("is announced as a switch and toggles", async () => {
    render(() => <Switch aria-label="Wi-Fi" />);
    const control = screen.getByRole("switch");
    await user.click(control);
    expect(slot("switch").getAttribute("data-selected")).toBe("");
  });

  test("the size is an attribute the CSS reads, not two class sets", () => {
    render(() => <Switch aria-label="Wi-Fi" size="sm" />);
    const track = slot("switch");
    expect(track.getAttribute("data-size")).toBe("sm");
    expect(rulesFor(track.className.split(" ")[0] ?? "")).toContain('[data-size="sm"]');
  });

  test("the thumb moves off the track's state", () => {
    render(() => <Switch aria-label="Wi-Fi" />);
    const thumb = slot("switch-thumb");
    expect(rulesFor(thumb.className.split(" ")[0] ?? "")).toContain("[data-selected] .");
  });
});

describe("RadioGroup", () => {
  test("selects one at a time", async () => {
    const picked: string[] = [];
    render(() => (
      <RadioGroup label="Size" onChange={(value) => picked.push(value)}>
        <RadioGroupItem value="s" aria-label="Small" />
        <RadioGroupItem value="m" aria-label="Medium" />
      </RadioGroup>
    ));
    const [small, medium] = screen.getAllByRole("radio") as HTMLInputElement[];
    await user.click(medium!);
    expect(picked).toEqual(["m"]);
    expect(small!.checked).toBe(false);
  });

  test("the dot is hidden until the radio is chosen", () => {
    render(() => (
      <RadioGroup label="Size" defaultValue="m">
        <RadioGroupItem value="s" aria-label="Small" />
        <RadioGroupItem value="m" aria-label="Medium" />
      </RadioGroup>
    ));
    const mark = document.querySelector('[data-slot="radio-group-indicator"]')!;
    const rules = rulesFor(mark.className.split(" ")[0] ?? "");
    expect(rules).toContain("display: none");
    expect(rules).toContain("[data-selected] .");
  });

  test("the grid is an inner element, so an empty label does not take a row", () => {
    render(() => (
      <RadioGroup label="Size">
        <RadioGroupItem value="s" aria-label="Small" />
      </RadioGroup>
    ));
    const items = slot("radio-group-items");
    expect(items.parentElement?.getAttribute("data-slot")).toBe("radio-group");
    expect(rulesFor(items.className.split(" ")[0] ?? "")).toContain("display: grid");
  });
});

describe("Progress", () => {
  test("reports its value to assistive technology", () => {
    render(() => <Progress value={60} label="Upload" />);
    const bar = screen.getByRole("progressbar", { name: "Upload" });
    expect(bar.getAttribute("aria-valuenow")).toBe("60");
    expect(bar.getAttribute("aria-valuetext")).toBe("60%");
  });

  test("the fill is a transform, so it animates without a layout", () => {
    render(() => <Progress value={25} label="Upload" />);
    expect(slot("progress-indicator").style.transform).toBe("translateX(-75%)");
  });

  test("an indeterminate bar has no value to report", () => {
    render(() => <Progress isIndeterminate label="Working" />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
  });
});

describe("Toggle", () => {
  test("announces its pressed state", async () => {
    render(() => <Toggle aria-label="Bold">B</Toggle>);
    const button = screen.getByRole("button", { name: "Bold" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await user.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("data-selected")).toBe("");
  });

  test("the outline variant draws a border and the default does not", () => {
    const [, outline] = toggleVariants({ variant: "outline" }).split(" ");
    const [, plain] = toggleVariants({ variant: "default" }).split(" ");
    expect(rulesFor(outline ?? "")).toContain("border-width: 1px");
    expect(rulesFor(plain ?? "")).toContain("background-color: transparent");
  });
});

describe("Avatar", () => {
  test("the image is replaced by the fallback when it fails", () => {
    render(() => (
      <Avatar>
        <AvatarImage src="/nope.png" alt="" />
        <AvatarFallback>SA</AvatarFallback>
      </Avatar>
    ));
    const image = slot("avatar-image");
    expect(image.tagName.toLowerCase()).toBe("img");
    image.dispatchEvent(new Event("error"));
    flush();
    expect(document.querySelector('[data-slot="avatar-image"]')).toBeNull();
    expect(slot("avatar-fallback").textContent).toBe("SA");
  });

  test("the size is on the root and the parts read it", () => {
    render(() => (
      <Avatar size="sm">
        <AvatarFallback>SA</AvatarFallback>
        <AvatarBadge />
      </Avatar>
    ));
    expect(slot("avatar").getAttribute("data-size")).toBe("sm");
    expect(rulesFor(slot("avatar-fallback").className.split(" ")[0] ?? "")).toContain(
      '[data-size="sm"] .',
    );
  });
});
