import { fireEvent, render, screen } from "@barqjs/testing";
import { expect, test } from "vitest";

import { App } from "./App.tsx";

test("the button counts its clicks", () => {
  render(() => <App />);
  const button = screen.getByRole("button");
  expect(button.textContent).toContain("clicked 0 times");

  fireEvent.click(button);

  expect(button.textContent).toContain("clicked 1 times");
});
