import { fireEvent, render, screen } from "@barqjs/testing";
import { expect, test } from "vitest";

import { Counter } from "./Counter.tsx";

test("the counter counts its clicks", () => {
  render(() => <Counter />);
  const button = screen.getByRole("button");
  expect(button.textContent).toContain("clicked 0 times");

  fireEvent.click(button);

  expect(button.textContent).toContain("clicked 1 times");
});
