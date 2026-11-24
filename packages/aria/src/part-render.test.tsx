import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@barqjs/testing";

import { partRender } from "./utils.ts";

afterEach(cleanup);

interface TargetProps {
  onClick?: () => void;
  "data-slot"?: string;
}

test("a part's props spread onto a component hand it the handler uncalled", () => {
  let pressed = 0;
  let seen: unknown;
  function Target(props: TargetProps) {
    seen = props.onClick;
    return (
      <button type="button" data-slot={props["data-slot"]} onClick={props.onClick}>
        go
      </button>
    );
  }
  const part = partRender({ "data-slot": "part", onClick: () => pressed++ });

  render(() => <Target {...part.props} />);

  expect(pressed).toBe(0);
  expect(typeof seen).toBe("function");
  const button = screen.getByRole("button", { name: "go" });
  expect(button.getAttribute("data-slot")).toBe("part");
  button.click();
  expect(pressed).toBe(1);
});

test("the same part spread onto an element attaches the handler", () => {
  let pressed = 0;
  const part = partRender({ "data-slot": "part", onClick: () => pressed++ });

  render(() => (
    <button type="button" {...part.props}>
      go
    </button>
  ));

  screen.getByRole("button", { name: "go" }).click();
  expect(pressed).toBe(1);
});
