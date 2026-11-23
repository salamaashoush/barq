import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { PageHeader } from "./page-header.tsx";

describe("PageHeader", () => {
  test("makes the heading the page's h1, with what is given beside it", () => {
    render(() => (
      <PageHeader
        heading="Checks"
        description="Everything this project watches."
        leading={<a href="/">Back</a>}
        actions={<button type="button">New check</button>}
      />
    ));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Checks");
    expect(screen.getByText("Everything this project watches.").tagName).toBe("P");
    expect(screen.getByRole("button", { name: "New check" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Back" })).toBeDefined();
  });

  test("leaves out what is not given", () => {
    render(() => <PageHeader heading="Plain" />);
    expect(document.querySelector('[data-slot="page-header-description"]')).toBeNull();
    expect(document.querySelector('[data-slot="page-header-actions"]')).toBeNull();
  });
});
