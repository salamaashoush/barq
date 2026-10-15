import {
  createEffect,
  createMemo,
  createProjection,
  createRenderEffect,
  createSignal,
  getObserver,
  isServer,
  onSettled,
  untrack,
} from "@barqjs/core";
import {
  type PartialKeys,
  type VirtualItem,
  type VirtualizerOptions,
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  observeWindowOffset,
  observeWindowRect,
  windowScroll,
} from "@tanstack/virtual-core";

export * from "@tanstack/virtual-core";

export type CreateVirtualizerOptions<
  TScrollElement extends Element,
  TItemElement extends Element,
> = PartialKeys<
  VirtualizerOptions<TScrollElement, TItemElement>,
  "observeElementRect" | "observeElementOffset" | "scrollToFn"
>;

export type CreateWindowVirtualizerOptions<TItemElement extends Element> = PartialKeys<
  VirtualizerOptions<Window, TItemElement>,
  "getScrollElement" | "observeElementRect" | "observeElementOffset" | "scrollToFn"
>;

type Range = Virtualizer<Element, Element>["range"];

function sameRange(a: Range, b: Range): boolean {
  return a?.startIndex === b?.startIndex && a?.endIndex === b?.endIndex;
}

// A key the caller leaves `undefined` keeps the adapter's default, so a
// conditional `scrollToFn: custom ? fn : undefined` cannot erase a required one.
function withDefaults<TOptions extends object>(
  defaults: Partial<TOptions>,
  options: object,
): TOptions {
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as TOptions;
}

function createVirtualizerBase<
  TScrollElement extends Element | Window,
  TItemElement extends Element,
>(
  options: () => VirtualizerOptions<TScrollElement, TItemElement>,
): Virtualizer<TScrollElement, TItemElement> {
  // The core writes its own state and reads it back in the same tick, and a
  // signal write is not published until the flush. So the core keeps the
  // state, and this signal only says "read it again".
  const [version, setVersion] = createSignal(0, { ownedWrite: true });
  let published = 0;
  const publish = (): void => {
    setVersion(++published);
  };

  const resolve = (): VirtualizerOptions<TScrollElement, TItemElement> => {
    const current = options();
    // Read here so a scroll element held in a signal re-applies the options
    // when it changes.
    current.getScrollElement();
    return {
      ...current,
      onChange: (instance, sync) => {
        publish();
        current.onChange?.(instance, sync);
      },
    };
  };

  const instance = new Virtualizer<TScrollElement, TItemElement>(untrack(resolve));

  // The core calls the caller's `estimateSize` and `getItemKey`, which may read
  // signals. Those reads are not dependencies of the mirror: `version` alone
  // says when the core has something new.
  const mirror =
    <T>(read: () => T) =>
    (): T => {
      version();
      return untrack(read);
    };
  const virtualItems = createProjection<Array<VirtualItem>>(
    mirror(() => instance.getVirtualItems()),
    [],
    { key: "key" },
  );
  const totalSize = createMemo(mirror(() => instance.getTotalSize()));
  const isScrolling = createMemo(mirror(() => instance.isScrolling));
  const range = createMemo(
    mirror(() => instance.calculateRange()),
    { equals: sameRange },
  );

  const getVirtualItems = (): Array<VirtualItem> => virtualItems;
  const getTotalSize = (): number =>
    getObserver() === null ? instance.getTotalSize() : totalSize();

  // A ref runs while its element is being built, before it is in the document,
  // where it has no layout and its attributes may not be written yet.
  const measureElement = (node: TItemElement | null): void => {
    if (node === null || node.isConnected) {
      instance.measureElement(node);
      return;
    }
    queueMicrotask(() => {
      if (node.isConnected) instance.measureElement(node);
    });
  };

  const virtualizer = new Proxy(instance, {
    get(target, property) {
      switch (property) {
        case "getVirtualItems":
          return getVirtualItems;
        case "getTotalSize":
          return getTotalSize;
        case "measureElement":
          return measureElement;
        case "isScrolling":
          return getObserver() === null ? target.isScrolling : isScrolling();
        case "range":
          return getObserver() === null ? target.range : range();
        default:
          return Reflect.get(target, property);
      }
    },
  });

  if (isServer) return virtualizer;

  createRenderEffect(resolve, (resolved) => {
    untrack(() => instance.setOptions(resolved));
    publish();
  });

  let mounted = false;
  onSettled(() => {
    const unmount = instance._didMount();
    mounted = true;
    untrack(instance._willUpdate);
    return () => {
      mounted = false;
      unmount();
    };
  });

  // After the rows and the sizer have been written: the core syncs the scroll
  // position to a layout it expects the document to already have.
  createEffect(version, () => {
    if (mounted) untrack(instance._willUpdate);
  });

  return virtualizer;
}

export function createVirtualizer<TScrollElement extends Element, TItemElement extends Element>(
  options:
    | CreateVirtualizerOptions<TScrollElement, TItemElement>
    | (() => CreateVirtualizerOptions<TScrollElement, TItemElement>),
): Virtualizer<TScrollElement, TItemElement> {
  return createVirtualizerBase<TScrollElement, TItemElement>(() =>
    withDefaults<VirtualizerOptions<TScrollElement, TItemElement>>(
      {
        observeElementRect,
        observeElementOffset,
        scrollToFn: elementScroll,
      },
      typeof options === "function" ? options() : options,
    ),
  );
}

export function createWindowVirtualizer<TItemElement extends Element>(
  options:
    | CreateWindowVirtualizerOptions<TItemElement>
    | (() => CreateWindowVirtualizerOptions<TItemElement>),
): Virtualizer<Window, TItemElement> {
  return createVirtualizerBase<Window, TItemElement>(() =>
    withDefaults<VirtualizerOptions<Window, TItemElement>>(
      {
        getScrollElement: () => (isServer ? null : window),
        observeElementRect: observeWindowRect,
        observeElementOffset: observeWindowOffset,
        scrollToFn: windowScroll,
        initialOffset: () => (isServer ? 0 : window.scrollY),
      },
      typeof options === "function" ? options() : options,
    ),
  );
}
