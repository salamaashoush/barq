import { describe, expect, test } from "bun:test";

import {
  For,
  Show,
  block,
  createMemo,
  createRoot,
  createSignal,
  flush,
  getOwner,
  onCleanup,
  runWithOwner,
} from "@barqjs/core";
import { createRenderer } from "./renderer.ts";
import { TEXT, createTestHost, inner, serialize, type TestNode } from "./test-host.ts";

const host = createTestHost();
const r = createRenderer(host.ops);

function mount(code: () => unknown): { root: TestNode; dispose: () => void } {
  const root = host.root();
  const dispose = r.render(code as never, root);
  return { root, dispose };
}

function el(tag: string, ...children: (TestNode | string)[]): TestNode {
  const node = r.createElement(tag);
  for (const child of children) {
    r.insertNode(node, typeof child === "string" ? r.createTextNode(child) : child);
  }
  return node;
}

async function settle(): Promise<void> {
  flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
}

describe("the node operations compiled code calls", () => {
  test("createElement, createTextNode and insertNode build a tree in order", () => {
    const tail = r.createTextNode("c");
    const parent = el("p", "a", tail);
    r.insertNode(parent, r.createTextNode("b"), tail);
    expect(serialize(parent)).toBe("<p>abc</p>");
    expect(tail.tag).toBe(TEXT);
  });

  test("setProp writes through the host, hands the previous value over and returns the new one", () => {
    const node = r.createElement("box");
    const seen: unknown[] = [];
    const recording = createRenderer({
      ...host.ops,
      setProperty: (_node, name, value, prev) => seen.push([name, value, prev]),
    });
    expect(recording.setProp(node, "width", 3)).toBe(3);
    expect(recording.setProp(node, "width", 4, 3)).toBe(4);
    expect(seen).toEqual([
      ["width", 3, undefined],
      ["width", 4, 3],
    ]);
    r.setProp(node, "title", "salama");
    expect(node.props).toEqual({ title: "salama" });
  });

  test("setProp gives a ref the node and runs what it returns when the owner goes", () => {
    let seen = null as TestNode | null;
    let undone = 0;
    const node = r.createElement("box");
    createRoot((dispose) => {
      r.setProp(node, "ref", (target: TestNode) => {
        seen = target;
        return () => undone++;
      });
      const holder: { current: TestNode | null } = { current: null };
      r.setProp(node, "ref", holder);
      expect(holder.current).toBe(node);
      dispose();
    });
    expect(seen).toBe(node);
    expect(undone).toBe(1);
    expect(node.props).toEqual({});
  });

  test("a host's attachRef hands a ref what it delivers, each time, and stops when the owner goes", () => {
    const deliveries = new Set<(value: unknown) => void>();
    let stopped = 0;
    const host = createRenderer({
      ...createTestHost().ops,
      attachRef(_node, deliver) {
        deliveries.add(deliver);
        return () => {
          deliveries.delete(deliver);
          stopped++;
        };
      },
    });
    const node = host.createElement("box");
    const seen: unknown[] = [];
    const released: unknown[] = [];
    const holder: { current: unknown } = { current: null };
    createRoot((dispose) => {
      host.setProp(node, "ref", (value: unknown) => {
        seen.push(value);
        return () => released.push(value);
      });
      host.setProp(node, "ref", holder);
      expect(seen).toEqual([]);
      expect(holder.current).toBe(null);
      for (const deliver of deliveries.values()) deliver("first");
      expect(seen).toEqual(["first"]);
      expect(holder.current).toBe("first");
      for (const deliver of deliveries.values()) deliver("second");
      expect(seen).toEqual(["first", "second"]);
      expect(released).toEqual(["first"]);
      dispose();
    });
    expect(released).toEqual(["first", "second"]);
    expect(stopped).toBe(2);
  });
});

describe("insert", () => {
  test("places static text, numbers, nodes and arrays, and nothing for null or a boolean", () => {
    const parent = el("p");
    r.insert(parent, "a");
    r.insert(parent, 1);
    r.insert(parent, [el("b", "x"), "y", null, false]);
    r.insert(parent, null);
    r.insert(parent, true);
    expect(serialize(parent)).toBe("<p>a1<b>x</b>y</p>");
  });

  test("a live value updates in place, before its anchor, keeping its text node", () => {
    const [text, setText] = createSignal("one");
    const { root, dispose } = mount(() => {
      const parent = el("p", "end");
      r.insert(parent, text, parent.children[0]);
      return parent;
    });
    const node = root.children[0].children[0];
    expect(inner(root)).toBe("<p>oneend</p>");
    setText("two");
    flush();
    expect(inner(root)).toBe("<p>twoend</p>");
    expect(root.children[0].children[0]).toBe(node);
    dispose();
    expect(root.children).toEqual([]);
  });

  test("a live value moves between text, nodes and nothing", () => {
    const [value, setValue] = createSignal<unknown>("text");
    const { root, dispose } = mount(() => {
      const parent = el("p", "|");
      r.insert(parent, value, parent.children[0]);
      return parent;
    });
    setValue([el("i", "a"), el("b", "c")]);
    flush();
    expect(inner(root)).toBe("<p><i>a</i><b>c</b>|</p>");
    const kept = root.children[0].children[1];
    setValue([kept]);
    flush();
    expect(inner(root)).toBe("<p><b>c</b>|</p>");
    expect(root.children[0].children[0]).toBe(kept);
    setValue(null);
    flush();
    expect(inner(root)).toBe("<p>|</p>");
    dispose();
  });

  test("a Block is built once and a Cell inside an array is a hole of its own", () => {
    const [count, setCount] = createSignal(1);
    let built = 0;
    const { root, dispose } = mount(() => {
      const parent = el("p");
      r.insert(
        parent,
        block(() => {
          built++;
          return ["n=", count];
        }),
      );
      return parent;
    });
    setCount(2);
    flush();
    expect(inner(root)).toBe("<p>n=2</p>");
    expect(built).toBe(1);
    dispose();
  });
});

describe("spread", () => {
  test("applies a props object, reads getters, passes handlers and skips children", () => {
    const [title, setTitle] = createSignal("a");
    const handler = (): void => {};
    const node = r.createElement("box");
    const dispose = createRoot((done) => {
      r.spread(node, { title, onPress: handler, children: "ignored", hidden: true });
      return done;
    });
    expect(node.props).toEqual({ title: "a", onPress: handler, hidden: true });
    setTitle("b");
    flush();
    expect(node.props.title).toBe("b");
    dispose();
  });

  test("a live object clears what vanished and leaves names written after it alone", () => {
    const [props, setProps] = createSignal<Record<string, unknown>>({ a: 1, b: 2, c: 3 });
    const node = r.createElement("box");
    const dispose = createRoot((done) => {
      r.spread(node, () => props(), ["c"]);
      return done;
    });
    expect(node.props).toEqual({ a: 1, b: 2 });
    setProps({ a: 1 });
    flush();
    expect(node.props).toEqual({ a: 1 });
    dispose();
  });
});

describe("control flow over the host", () => {
  test("branch swaps arms and keeps an arm whose key did not move", () => {
    const [key, setKey] = createSignal(0);
    const { root, dispose } = mount(() => {
      const parent = el("p", "|");
      r.branch(parent, parent.children[0], key, [block(() => el("a")), block(() => el("b"))]);
      return parent;
    });
    const first = root.children[0].children[0];
    expect(inner(root)).toBe("<p><a></a>|</p>");
    setKey(0);
    flush();
    expect(root.children[0].children[0]).toBe(first);
    setKey(1);
    flush();
    expect(inner(root)).toBe("<p><b></b>|</p>");
    dispose();
  });

  test("each keeps a row's node through a reorder and shows its fallback when empty", () => {
    const [items, setItems] = createSignal(["a", "b", "c"]);
    const { root, dispose } = mount(() => {
      const list = el("ul");
      r.each(
        list,
        null,
        items,
        null,
        (item: string) => el("li", item),
        0,
        block(() => el("empty")),
      );
      return list;
    });
    const b = root.children[0].children[1];
    setItems(["c", "b", "a"]);
    flush();
    expect(inner(root)).toBe("<ul><li>c</li><li>b</li><li>a</li></ul>");
    expect(root.children[0].children[1]).toBe(b);
    setItems([]);
    flush();
    expect(inner(root)).toBe("<ul><empty></empty></ul>");
    dispose();
  });

  test("an error boundary shows its fallback with the error, and a reset builds the body again", () => {
    const [broken, setBroken] = createSignal(true);
    let reset: (() => void) | undefined;
    const { root, dispose } = mount(() => {
      const parent = el("p");
      r.boundary(
        parent,
        null,
        "error",
        block((error: () => Error, again: () => void) => {
          reset = again;
          return el("oops", error().message);
        }) as never,
        block(() => {
          if (broken()) throw new Error("broken");
          return el("fine");
        }),
      );
      return parent;
    });
    expect(inner(root)).toBe("<p><oops>broken</oops></p>");
    setBroken(false);
    flush();
    reset?.();
    flush();
    expect(inner(root)).toBe("<p><fine></fine></p>");
    dispose();
  });

  test("a loading boundary parks its body behind the fallback until the value arrives", async () => {
    let resolve: (value: string) => void = () => {};
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    const { root, dispose } = mount(() => {
      const parent = el("p");
      r.boundary(
        parent,
        null,
        "loading",
        block(() => el("wait")),
        block(() => {
          const value = createMemo(() => pending);
          const done = el("done");
          r.insert(done, value);
          return done;
        }),
      );
      return parent;
    });
    await settle();
    expect(inner(root)).toBe("<p><wait></wait></p>");
    resolve("ready");
    await settle();
    expect(inner(root)).toBe("<p><done>ready</done></p>");
    dispose();
  });

  test("an island with nothing to claim builds its children", () => {
    const { root, dispose } = mount(() => {
      const parent = el("p");
      r.island(
        parent,
        null,
        block(() => el("static", "x")),
      );
      return parent;
    });
    expect(inner(root)).toBe("<p><static>x</static></p>");
    dispose();
  });

  test("reveal renders the group it orders", () => {
    const { root, dispose } = mount(() =>
      r.reveal(
        () => undefined,
        () => undefined,
        block(() => [el("a"), el("b")]),
      ),
    );
    expect(inner(root)).toBe("<a></a><b></b>");
    dispose();
  });
});

describe("components that need the host", () => {
  test("Portal mounts into its target, into the render root by default, and leaves with its owner", async () => {
    const target = host.root("target");
    const [into, setInto] = createSignal<TestNode | undefined>(target);
    const { root, dispose } = mount(() =>
      el("main", r.Portal({ mount: into, children: block(() => el("modal")) }) as TestNode),
    );
    await settle();
    expect(inner(target)).toBe("<modal></modal>");
    setInto(undefined);
    await settle();
    expect(inner(target)).toBe("");
    expect(inner(root)).toBe("<main></main><modal></modal>");
    dispose();
    expect(inner(root)).toBe("");
  });

  test("Portal refuses a selector, which only the document can look up", () => {
    expect(() =>
      mount(() => {
        const holder = el("main");
        r.insert(
          holder,
          r.portal(
            () => "#target" as never,
            block(() => el("modal")),
          ),
        );
        return holder;
      }),
    ).toThrow('`<Portal mount>` was given "#target"');
  });

  test("dynamic builds a tag with its props or calls a component, and moves when its source does", () => {
    const [tag, setTag] = createSignal<string | ((props: Record<string, unknown>) => unknown)>(
      "box",
    );
    const Shown = r.dynamic(tag);
    const { root, dispose } = mount(() =>
      Shown({ title: () => "salama", children: block(() => "inside") }),
    );
    expect(inner(root)).toBe('<box title="salama">inside</box>');
    setTag(() => (props: Record<string, unknown>) => el("card", (props.title as () => string)()));
    flush();
    expect(inner(root)).toBe("<card>salama</card>");
    dispose();
  });

  test("a core component called inside a render renders through this renderer", () => {
    const [items] = createSignal(["x", "y"]);
    const { root, dispose } = mount(() => [
      Show({ when: () => true, children: block(() => el("shown")) }),
      For({ each: items, children: (item: string) => el("i", item) }),
    ]);
    expect(inner(root)).toBe("<shown></shown><i>x</i><i>y</i>");
    dispose();
  });
});

describe("render", () => {
  test("mounts under a root of its own, owned by the given owner, and the disposer removes it", () => {
    let cleaned = 0;
    let disposeOwner: () => void = () => {};
    const root = host.root();
    createRoot((dispose) => {
      disposeOwner = dispose;
      const owner = getOwner();
      r.render(
        () => {
          onCleanup(() => cleaned++);
          return el("app");
        },
        root,
        { owner },
      );
    });
    expect(inner(root)).toBe("<app></app>");
    runWithOwner(null, disposeOwner);
    expect(cleaned).toBe(1);
    expect(inner(root)).toBe("");
  });
});
