import { afterEach, beforeEach, expect, test } from "bun:test";
import { render, setAttr, setClass, spread } from "./dom.ts";
import { bindEffect } from "./signals.ts";
import { boundary } from "./dom-flow.ts";
import type { Block } from "./scope.ts";
import {
  block,
  createSignal,
  disposeScope,
  flush,
  rootScope,
  runWithOwner,
  type Scope,
} from "./signals.ts";

// The container is a render root, as every element an application shows is
// under one: a delegated handler outside a root has nothing listening for it.
let host: HTMLDivElement;
let unmount: () => void;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  unmount = render(() => null, host);
});

afterEach(() => {
  unmount();
  host.remove();
});

function mount(build: () => void): Scope {
  const root = rootScope();
  runWithOwner(root, build);
  flush();
  return root;
}

function failing(message: string): () => void {
  return () => {
    throw new Error(message);
  };
}

function guardedButton(props: () => Record<string, unknown>): void {
  boundary(
    host,
    null,
    "error",
    block(((error: () => Error) => {
      const note = document.createElement("p");
      note.textContent = `caught: ${error().message}`;
      return note;
    }) as Block<unknown>),
    block(() => {
      const button = document.createElement("button");
      spread(button, props);
      return button;
    }),
  );
}

function click(): unknown {
  try {
    host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  } catch (error) {
    return error;
  }
  flush();
  return null;
}

test("a spread click handler that throws still reaches the boundary after the spread source changed", () => {
  const [props, setProps] = createSignal<Record<string, unknown>>({ onClick: failing("first") });
  mount(() => guardedButton(props));
  setProps({ onClick: failing("second") });
  flush();
  expect(click()).toBeNull();
  expect(host.textContent).toBe("caught: second");
});

// `<div {...rest()} class="card" title={label()} />`, as the compiler emits it.
test("an attribute written after a spread still wins once the spread source changes", () => {
  const node = document.createElement("div");
  const [rest, setRest] = createSignal<Record<string, unknown>>({ title: "rest", class: "wide" });
  const [label] = createSignal("explicit");
  mount(() => {
    spread(node, () => rest(), ["class", "title"]);
    setClass(node, "class", "card");
    bindEffect(
      () => label(),
      (value, previous) => {
        if (value !== previous) setAttr(node, "title", value);
      },
    );
  });
  expect(node.getAttribute("title")).toBe("explicit");
  expect(node.className).toBe("card");

  setRest({ title: "changed", class: "narrow" });
  flush();
  expect(node.getAttribute("title")).toBe("explicit");
  expect(node.className).toBe("card");
});

test("a ref callback that arrives through a spread has its cleanup run at disposal", () => {
  const node = document.createElement("div");
  let cleaned = 0;
  const root = mount(() => {
    spread(node, {
      ref: () => () => {
        cleaned++;
      },
    });
  });
  disposeScope(root);
  expect(cleaned).toBe(1);
});
