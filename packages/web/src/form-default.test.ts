/**
 * The content attribute a live write leaves behind is the field's default, and
 * only the first write decides it.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { setLive } from "./dom.ts";

let form: HTMLFormElement;

beforeEach(() => {
  form = document.createElement("form");
  document.body.appendChild(form);
});

afterEach(() => {
  form.remove();
});

test("a checkbox that started unchecked keeps that as its default after it is checked", () => {
  const box = document.createElement("input");
  box.type = "checkbox";
  form.appendChild(box);
  setLive(box, "checked", false);
  setLive(box, "checked", true);
  expect(box.checked).toBe(true);
  expect(box.defaultChecked).toBe(false);
});
