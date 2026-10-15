import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import ResizableDemo from "./resizable-demo.tsx";
import ResizableHandleDemo from "./resizable-handle.tsx";
import ResizableRtl from "./resizable-rtl.tsx";
import ResizableVertical from "./resizable-vertical.tsx";

const value = (handle: HTMLElement): number => Number(handle.getAttribute("aria-valuenow"));

describe("the resizable examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("resizable")).toEqual([]);
  });

  test("two groups nest, each with a handle", () => {
    render(() => <ResizableDemo />);
    const handles = screen.getAllByRole("separator");
    expect(handles).toHaveLength(2);
    expect(handles.map((handle) => handle.getAttribute("aria-orientation"))).toEqual([
      "vertical",
      "horizontal",
    ]);
  });

  test("an arrow key on the handle moves the split", async () => {
    render(() => <ResizableHandleDemo />);
    const handle = screen.getByRole("separator");
    const before = value(handle);
    handle.focus();
    await user.keyboard("{ArrowRight}");
    flush();
    expect(value(handle)).toBe(before + 1);
  });

  test("a vertical group takes the up and down keys", async () => {
    render(() => <ResizableVertical />);
    const handle = screen.getByRole("separator");
    const before = value(handle);
    handle.focus();
    await user.keyboard("{ArrowDown}");
    flush();
    expect(value(handle)).toBe(before + 1);
  });

  test("in right to left the left arrow grows the first panel", async () => {
    render(() => <ResizableRtl />);
    const handle = screen.getAllByRole("separator")[0] as HTMLElement;
    const before = value(handle);
    handle.focus();
    await user.keyboard("{ArrowLeft}");
    flush();
    expect(value(handle)).toBe(before + 1);
  });
});
