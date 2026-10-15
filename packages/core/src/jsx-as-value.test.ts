/**
 * JSX arriving where a value is read is refused with `ScopeMissingError`, and
 * the message names the attribute, prop or handler it arrived at.
 */

import { describe, expect, test } from "bun:test";

import { listen, setAttr } from "./dom.ts";
import { ScopeMissingError, block, readSlot, underScope } from "./signals.ts";
import { toString } from "./type-utils.ts";

const TAIL =
  " JSX where a value is expected. JSX passed as a prop or as children is built only where it " +
  "is rendered, so there is no value to read from it here. Render it as a child, " +
  "`<span>{props.children}</span>`, or pass a string, a number or an accessor.";

function thrownBy(body: () => unknown): ScopeMissingError {
  try {
    body();
  } catch (error) {
    expect(error).toBeInstanceOf(ScopeMissingError);
    return error as ScopeMissingError;
  }
  throw new Error("nothing was thrown");
}

describe("JSX where a value is expected", () => {
  const jsx = block(() => document.createElement("b"));

  test("a `Component.prop` label is spelled as the prop of that component", () => {
    const error = thrownBy(() => readSlot(jsx, "Link.to"));
    expect(error.name).toBe("ScopeMissingError");
    expect(error.origin).toBe("Link.to");
    expect(error.message).toBe(`The \`to\` prop of \`<Link>\` was given${TAIL}`);
  });

  test("a function that hands JSX back is told apart from JSX passed directly", () => {
    const error = thrownBy(() => readSlot(() => jsx, "Show.when"));
    expect(error.message).toBe(
      `The \`when\` prop of \`<Show>\` is a function that returned${TAIL}`,
    );
  });

  test("an event handler names the handler", () => {
    const button = document.createElement("button");
    const error = thrownBy(() => listen(button, "click", jsx));
    expect(error.message).toBe(`The \`onclick\` handler was given${TAIL}`);
  });

  test("a text or attribute position is named as one", () => {
    const error = thrownBy(() => toString(jsx));
    expect(error.message).toBe(`A text or attribute position was given${TAIL}`);
  });

  test("built JSX written into an attribute names the attribute and the element", () => {
    const paragraph = document.createElement("p");
    const error = thrownBy(() => setAttr(paragraph, "title", document.createElement("b")));
    expect(error.origin).toBe("setAttr title");
    expect(error.message).toStartWith(
      "The `title` attribute on `<p>` was given a DOM node, and an attribute can only hold text.",
    );
    expect(error.message).toEndWith(
      "Render it as a child, `<span>{props.icon}</span>`, or pass a string.",
    );
  });
});

describe("an owner that was never passed", () => {
  test("the message names the call and both ways to satisfy it", () => {
    const error = thrownBy(() => underScope(undefined, "listen", () => null));
    expect(error.origin).toBe("listen");
    expect(error.message).toBe(
      "`listen` was called with `undefined` where its owner is expected, so nothing would " +
        "dispose the effects and listeners it creates. Pass the owner from `getOwner()`, or " +
        "`null` to run without one on purpose.",
    );
  });
});
