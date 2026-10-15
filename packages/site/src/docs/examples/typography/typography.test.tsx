import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import TypographyDemo from "./typography-demo.tsx";
import TypographyRtl from "./typography-rtl.tsx";

describe("the typography examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("typography")).toEqual([]);
  });

  test("the article is one title, one section heading, three subsections and a table", () => {
    render(() => <TypographyDemo />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "a brilliant plan" })).not.toBeNull();
  });

  test("the right-to-left article names its direction on its own element", () => {
    render(() => <TypographyRtl />);
    expect(screen.getByRole("heading", { level: 1 }).closest("[dir]")?.getAttribute("dir")).toBe(
      "rtl",
    );
  });
});
