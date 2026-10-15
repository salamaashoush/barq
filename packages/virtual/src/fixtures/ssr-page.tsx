import { For } from "@barqjs/core";
import { renderToString } from "@barqjs/server";
import { type VirtualItem, createVirtualizer, createWindowVirtualizer } from "../index.ts";

export function ElementList() {
  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: 1000,
    getScrollElement: () => null,
    estimateSize: () => 50,
    initialRect: { width: 300, height: 200 },
  });
  return (
    <div class="scroller">
      <div class="sizer" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        <For each={virtualizer.getVirtualItems()} keyed={(item: VirtualItem) => item.key}>
          {(item: () => VirtualItem) => (
            <div
              data-index={item().index}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${item().start}px)` }}
            >
              Row {item().index}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

export function WindowList() {
  const virtualizer = createWindowVirtualizer<HTMLDivElement>(() => ({
    count: 1000,
    estimateSize: () => 40,
    initialRect: { width: 300, height: 120 },
  }));
  return (
    <ul style={{ height: `${virtualizer.getTotalSize()}px` }}>
      <For each={virtualizer.getVirtualItems()} keyed={(item: VirtualItem) => item.key}>
        {(item: () => VirtualItem) => <li data-index={item().index}>Item {item().index}</li>}
      </For>
    </ul>
  );
}

export const renderElementList = (): string => renderToString(() => <ElementList />);
export const renderWindowList = (): string => renderToString(() => <WindowList />);
