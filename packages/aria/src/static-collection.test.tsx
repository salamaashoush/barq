import { describe, expect, test } from "bun:test";
import { createRoot, createSignal, flush, Show, type Child, type Incoming } from "@barqjs/core";
import { render, tick } from "@barqjs/testing";

import { listState } from "./collections.ts";
import {
  provideStaticSection,
  staticAccessors,
  staticCollection,
  staticItem,
  type StaticCollection,
  type StaticEntry,
} from "./static-collection.ts";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

function Row(
  props: Incoming<{
    of: StaticCollection;
    id?: string;
    textValue?: string;
    isDisabled?: boolean;
    isHidden?: boolean;
    children?: Child;
  }>,
) {
  const item = staticItem(props.of(), {
    key: props.id?.(),
    textValue: () => props.textValue?.(),
    props: () => ({ isDisabled: props.isDisabled?.() === true }),
    isHidden: () => props.isHidden?.(),
  });
  return (
    <li ref={item.ref} data-key={String(item.key)}>
      {props.children}
    </li>
  );
}

function Group(props: Incoming<{ of: StaticCollection; id: string; children?: Child }>) {
  const section = staticItem(props.of(), { key: props.id(), type: "section", textValue: "" });
  return (
    <li ref={section.ref}>
      <ul>{provideStaticSection(section.key, () => props.children) as Child}</ul>
    </li>
  );
}

function texts(entries: StaticEntry[]): string[] {
  return entries.map((entry) => entry.textValue);
}

describe("staticCollection", () => {
  test("the rendered items are the entries, in order, named by their own text", async () => {
    const collection = staticCollection();
    render(() => (
      <ul>
        <Row of={collection}>Rename</Row>
        <Row of={collection}>Duplicate</Row>
        <Row of={collection}>Delete</Row>
      </ul>
    ));
    await settle();

    expect(texts(collection.entries())).toEqual(["Rename", "Duplicate", "Delete"]);
    expect(new Set(collection.keys()).size).toBe(3);
  });

  test("a given key and a given text win over the generated ones", async () => {
    const collection = staticCollection();
    render(() => (
      <ul>
        <Row of={collection} id="rename" textValue="Rename the file">
          Rename
        </Row>
      </ul>
    ));
    await settle();

    expect(collection.entries()).toEqual([
      { key: "rename", type: "item", textValue: "Rename the file", props: { isDisabled: false } },
    ]);
    expect(collection.elementOf("rename")?.textContent).toBe("Rename");
  });

  test("an item a <Show> inserts later lands where it is in the document", async () => {
    const collection = staticCollection();
    const [shown, setShown] = createSignal(false);
    render(() => (
      <ul>
        <Row of={collection}>First</Row>
        <Show when={shown()}>
          <Row of={collection}>Second</Row>
        </Show>
        <Row of={collection}>Third</Row>
      </ul>
    ));
    await settle();
    expect(texts(collection.entries())).toEqual(["First", "Third"]);

    setShown(true);
    await settle();
    expect(texts(collection.entries())).toEqual(["First", "Second", "Third"]);

    setShown(false);
    await settle();
    expect(texts(collection.entries())).toEqual(["First", "Third"]);
  });

  test("a hidden item stays mounted and leaves the entries", async () => {
    const collection = staticCollection();
    const [hidden, setHidden] = createSignal(false);
    render(() => (
      <ul>
        <Row of={collection} id="a">
          Apple
        </Row>
        <Row of={collection} id="b" isHidden={hidden()}>
          Banana
        </Row>
      </ul>
    ));
    await settle();
    expect(texts(collection.entries())).toEqual(["Apple", "Banana"]);

    setHidden(true);
    await settle();
    expect(texts(collection.entries())).toEqual(["Apple"]);
    expect(collection.keys()).toEqual(["a", "b"]);
    expect(collection.elementOf("b")).not.toBeNull();
  });

  test("a key rendered twice survives the first copy leaving", async () => {
    // A select builds its options off the page while closed and again in the
    // popover when it opens, and the two overlap for as long as the swap takes.
    const collection = staticCollection();
    const [first, setFirst] = createSignal(true);
    const [second, setSecond] = createSignal(false);
    render(() => (
      <>
        <Show when={first()}>
          <ul>
            <Row of={collection} id="a">
              Apple
            </Row>
          </ul>
        </Show>
        <Show when={second()}>
          <ul>
            <Row of={collection} id="a">
              Apple
            </Row>
          </ul>
        </Show>
      </>
    ));
    await settle();

    setSecond(true);
    await settle();
    setFirst(false);
    await settle();

    expect(collection.keys()).toEqual(["a"]);
    expect(collection.elementOf("a")?.isConnected).toBe(true);
  });

  test("items inside a section are that section's children", async () => {
    const collection = staticCollection();
    render(() => (
      <ul>
        <Row of={collection} id="solo">
          Solo
        </Row>
        <Group of={collection} id="fruit">
          <Row of={collection} id="apple">
            Apple
          </Row>
          <Row of={collection} id="banana">
            Banana
          </Row>
        </Group>
      </ul>
    ));
    await settle();

    const entries = collection.entries();
    expect(entries.map((entry) => entry.key)).toEqual(["solo", "fruit"]);
    expect(entries[1]?.type).toBe("section");
    expect(entries[1]?.children?.map((entry) => entry.key)).toEqual(["apple", "banana"]);
  });

  test("a list state built from it walks the items and honours a disabled one", async () => {
    const collection = staticCollection();
    const [disabled, setDisabled] = createSignal(true);
    const state = createRoot(() =>
      listState<StaticEntry>({ items: collection.entries, ...staticAccessors }),
    );
    render(() => (
      <ul>
        <Row of={collection} id="a">
          Apple
        </Row>
        <Row of={collection} id="b" isDisabled={disabled()}>
          Banana
        </Row>
        <Row of={collection} id="c">
          Cherry
        </Row>
      </ul>
    ));
    await settle();

    expect([...state.collection().getKeys()]).toEqual(["a", "b", "c"]);
    expect(state.collection().getItem("b")?.textValue).toBe("Banana");
    expect(state.selectionManager().isDisabled("b")).toBe(true);

    setDisabled(false);
    await settle();
    expect(state.selectionManager().isDisabled("b")).toBe(false);
  });
});
