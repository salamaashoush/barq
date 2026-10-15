import { describe, expect, test } from "bun:test";
import { For, Show, flush, createSignal } from "@barqjs/core";
import { Item, ItemGroup, ItemTitle } from "./ui/item.tsx";
import { ScrollArea } from "./ui/scroll-area.tsx";
import { cleanup, render } from "@barqjs/testing";

interface Row {
  id: string;
}

const order = (container: HTMLElement): string =>
  [...container.querySelectorAll("[data-node]")]
    .map((node) => node.getAttribute("data-node"))
    .join(",");

const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }));

describe("a keyed list that loses two rows and gains one", () => {
  test("plain elements", () => {
    const [list, setList] = createSignal<Row[]>(rows("a", "b", "c", "d", "e"));
    const { container } = render(() => (
      <ul>
        <For each={() => list()} keyed={(row: Row) => row.id}>
          {(row: () => Row) => <li data-node={row().id}>{() => row().id}</li>}
        </For>
      </ul>
    ));
    expect(order(container)).toBe("a,b,c,d,e");

    // b and c go into g, where c was.
    setList(rows("a", "g", "d", "e"));
    flush();
    expect(order(container)).toBe("a,g,d,e");
    cleanup();
  });

  test("rows that are components", () => {
    const [list, setList] = createSignal<Row[]>(rows("a", "b", "c", "d", "e"));
    const { container } = render(() => (
      <ItemGroup>
        <For each={() => list()} keyed={(row: Row) => row.id}>
          {(row: () => Row) => (
            <Item size="2xs" data-node={row().id}>
              <ItemTitle>{() => row().id}</ItemTitle>
            </Item>
          )}
        </For>
      </ItemGroup>
    ));
    expect(order(container)).toBe("a,b,c,d,e");

    setList(rows("a", "g", "d", "e"));
    flush();
    expect(order(container)).toBe("a,g,d,e");
    cleanup();
  });

  test("inside a Show, inside a ScrollArea, which is how the panel has it", () => {
    const [list, setList] = createSignal<Row[]>(rows("a", "b", "c", "d", "e"));
    const { container } = render(() => (
      <ScrollArea orientation="vertical">
        <Show when={() => list().length > 0} fallback={<p>none</p>}>
          <ItemGroup>
            <For each={() => list()} keyed={(row: Row) => row.id}>
              {(row: () => Row) => (
                <Item size="2xs" data-node={row().id}>
                  <ItemTitle>{() => row().id}</ItemTitle>
                </Item>
              )}
            </For>
          </ItemGroup>
        </Show>
      </ScrollArea>
    ));
    expect(order(container)).toBe("a,b,c,d,e");

    setList(rows("a", "g", "d", "e"));
    flush();
    expect(order(container)).toBe("a,g,d,e");
    cleanup();
  });

  test("a list the size of a real layers panel", () => {
    // The document's own order, and the panel shows it reversed: this is the
    // shape a grouping makes, two rows out of the middle and one in.
    const ids = Array.from({ length: 25 }, (_, index) => `n${index}`);
    const [list, setList] = createSignal<Row[]>(rows(...ids.toReversed()));

    const { container } = render(() => (
      <ScrollArea orientation="vertical">
        <Show when={() => list().length > 0} fallback={<p>none</p>}>
          <ItemGroup>
            <For each={() => list()} keyed={(row: Row) => row.id}>
              {(row: () => Row) => (
                <Item size="2xs" data-node={row().id}>
                  <ItemTitle>{() => row().id}</ItemTitle>
                </Item>
              )}
            </For>
          </ItemGroup>
        </Show>
      </ScrollArea>
    ));
    expect(order(container).split(",")[0]).toBe("n24");

    // n23 and n22 become a group, inserted where n22 was.
    const grouped = [...ids.slice(0, 22), "group", "n24"];
    setList(rows(...grouped.toReversed()));
    flush();

    expect(order(container).split(",").slice(0, 3).join(",")).toBe("n24,group,n21");
    cleanup();
  });
});
