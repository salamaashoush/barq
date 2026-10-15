/**
 * A channel called without what it last applied was not asked to compare. The
 * compiled record makes the compare itself and calls with three arguments, so
 * a value that goes to `undefined` has to clear what the last one wrote.
 */

import { expect, test } from "bun:test";
import { setAttr, setDomProp, setStyleProp } from "./dom.ts";
import { DEV } from "./signals.ts";

test("an attribute written and then given undefined is removed", () => {
  const element = document.createElement("p");
  setAttr(element, "title", "saved");
  setAttr(element, "title", undefined);
  expect(element.hasAttribute("title")).toBe(false);
});

test("a property written true and then given undefined is cleared", () => {
  const button = document.createElement("button");
  setDomProp(button, "disabled", true);
  setDomProp(button, "disabled", undefined);
  expect(button.disabled).toBe(false);
});

test("a string property given undefined is emptied, not spelled out", () => {
  const option = document.createElement("option");
  setDomProp(option, "value", "ada");
  setDomProp(option, "value", undefined);
  expect(option.getAttribute("value") ?? "").toBe("");
  const holder = document.createElement("div");
  setDomProp(holder, "innerHTML", "<b>x</b>");
  setDomProp(holder, "innerHTML", undefined);
  expect(holder.innerHTML).toBe("");
});

test("one css declaration given undefined is taken off", () => {
  const element = document.createElement("p");
  setStyleProp(element, "color", "red");
  setStyleProp(element, "color", undefined);
  expect(element.style.color).toBe("");
});

test("a caller that passes what it applied still skips an unchanged write", () => {
  const element = document.createElement("p");
  let writes = 0;
  const setAttribute = element.setAttribute.bind(element);
  element.setAttribute = (name: string, value: string) => {
    writes++;
    setAttribute(name, value);
  };
  const applied = setAttr(element, "title", "saved", undefined);
  setAttr(element, "title", "saved", applied);
  expect(writes).toBe(1);
});

test("a function given to an attribute is reported, naming the attribute and the element", () => {
  const element = document.createElement("p");
  const capture = DEV.diagnostics.capture();
  setAttr(element, "title", () => "salama");
  setAttr(element, "lang", "en");
  const events = capture.stop();
  expect(events.map((event) => event.code)).toEqual(["FUNCTION_AS_ATTRIBUTE"]);
  expect(events[0]?.message).toStartWith(
    "The `title` attribute on `<p>` was given a function, so the function's source text is written",
  );
  expect(events[0]?.message).toContain('`title={open() ? label() : "closed"}`');
});
