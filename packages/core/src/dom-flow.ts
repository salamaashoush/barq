/**
 * Control flow in a document: each construct of `flow.ts` over `DOM_HOST`, in
 * the shape compiled code calls it, and the portal, which mounts into a node
 * outside the tree that declares it.
 */

import { DOM_HOST, syncRowsDom } from "./dom-host.ts";
import {
  delegatedRootOf,
  hostPortal,
  registerDelegatedContainer,
  unregisterDelegatedContainer,
} from "./dom.ts";
import {
  type BoundaryKind,
  type COUNT,
  HYDRATE,
  NOTHING,
  type Site,
  activate,
  boundaryIn,
  branchIn,
  cellSlot,
  eachIn,
  islandIn,
  nextActivation,
  revealIn,
  teardown,
} from "./flow.ts";
import { probeRange, rangeNodes, releaseRange } from "./hydration.ts";
import { hydrating } from "./hydration-state.ts";
import type { Block, Cell } from "./scope.ts";
import {
  type Maybe,
  type RevealOrder,
  createEffect,
  getOwner,
  onCleanup,
  underScope,
  untrack,
} from "./signals.ts";

const NO_ARGS: readonly unknown[] = [];

export function branch<K>(
  parent: Node | null,
  anchor: Node | null,
  key: Cell<K>,
  bodies: Block<unknown> | readonly (Block<unknown> | null | undefined)[],
  flags?: number,
): Node | Node[] | null {
  return branchIn(DOM_HOST, parent, anchor, key, bodies, flags);
}

export function each<T>(
  parent: Node | null,
  anchor: Node | null,
  src: Cell<Maybe<readonly T[]>> | Cell<number>,
  carrier: ((item: T) => unknown) | false | null | typeof COUNT | Cell<unknown>,
  row: Block<unknown, never[]>,
  flags?: number,
  fallback?: Block<unknown> | null,
): Node | Node[] | null {
  return eachIn(DOM_HOST, syncRowsDom, parent, anchor, src, carrier, row, flags, fallback);
}

export function boundary(
  parent: Node | null,
  anchor: Node | null,
  kind: BoundaryKind,
  fallback: Block<unknown> | null | undefined,
  body: Block<unknown>,
  flags?: number,
  on?: Cell<unknown>,
): Node | Node[] | null {
  return boundaryIn(DOM_HOST, parent, anchor, kind, fallback, body, flags, on);
}

export function island(
  parent: Node | null,
  anchor: Node | null,
  block: Block<unknown>,
  flags?: number,
): Node | null {
  return islandIn(DOM_HOST, parent, anchor, block, flags);
}

export function reveal(
  order: Cell<RevealOrder | undefined>,
  collapsed: Cell<boolean | undefined>,
  block: Block<unknown>,
): Node[] {
  return revealIn(DOM_HOST, order, collapsed, block);
}

/**
 * A hole whose insertion target is elsewhere and whose scope's parent is the
 * LEXICAL one, which is why a portalled modal reads the provider it is
 * WRITTEN under (X4).
 */
export function portal(target: Cell<Node | string | null | undefined>, block: Block<unknown>): Node;
export function portal(
  target: Cell<Node | string | null | undefined>,
  block: Block<unknown>,
  flags: number,
): Node | Node[];
export function portal(
  target: Cell<Node | string | null | undefined>,
  block: Block<unknown>,
  flags = 0,
): Node | Node[] {
  const given = getOwner();
  cellSlot(target, "Portal.mount");
  // Read once here as well as in the effect below: what the Cell YIELDS is
  // refused on the read, and the effect's first read is the engine's to
  // schedule, where a refusal would surface a turn late and away from the
  // construct that caused it.
  cellSlot(untrack(target), "Portal.mount", true);

  // A portal is the one construct whose server bytes are in the WRONG PLACE by
  // construction: the string backend has no second insertion point, so it wrote
  // an EMPTY range at the lexical position and the content is the client's to
  // build. The range is still this portal's to take: left at the cursor, it is
  // two nodes the enclosing region did not build and reports as a mismatch.
  const claimed = hydrating() && (flags & HYDRATE) !== 0 ? probeRange(null, null) : null;
  if (claimed !== null) releaseRange(claimed);
  const marker: Node = claimed?.close ?? document.createTextNode("");

  underScope(given, "portal", () => {
    let instance = NOTHING;
    let container: HTMLElement | null = null;
    let delegatingFor: Node | null = null;
    let request = 0;
    const site: Site = { host: DOM_HOST, parent: null, anchor: null };

    const clear = (): void => {
      if (instance !== NOTHING) {
        teardown(DOM_HOST, instance);
        instance = NOTHING;
      }
      if (container !== null && delegatingFor !== null) {
        unregisterDelegatedContainer(container, delegatingFor);
      }
      delegatingFor = null;
      container?.parentNode?.removeChild(container);
      container = null;
      site.parent = null;
    };

    // An EFFECT, not a render effect, and that is where the mount's timing
    // comes from. It runs once the pass that placed the marker has written the
    // document, so a target inside the tree being built is there to be found;
    // and under a boundary that is still showing its fallback the engine holds
    // it until the content is revealed, which is the moment a portal the
    // content declares should appear. Deferred to a microtask instead, it asked
    // once whether the marker was connected, found the parked content was not,
    // and never asked again.
    createEffect(
      () => {
        const requested = target();
        cellSlot(requested, "Portal.mount", true);
        return requested;
      },
      (requested) => {
        clear();
        const mine = ++request;
        const mount = (): void => {
          // The marker IS the portal's lexical position, so a tree that was
          // never put in a document mounts nothing outside itself either.
          if (mine !== request || !marker.isConnected) return;
          const host = resolveTarget(requested);
          if (host === null) return;
          container = document.createElement("div");
          container.style.display = "contents";
          hostPortal(container, marker);
          site.parent = container;
          nextActivation();
          instance = activate(given, site, block, NO_ARGS, flags, "portal");
          host.appendChild(container);
          // A root's own listener already hears a portal mounted inside it.
          const root = delegatedRootOf(marker);
          if (root !== null && !root.contains(container)) {
            registerDelegatedContainer(container, root);
            delegatingFor = root;
          }
        };
        // A portal nothing owns has no scope to build under, and the engine
        // refuses one made from inside an effect's write. It mounts a turn
        // later, outside it, and only if it is still the one being asked for.
        if (given === null) queueMicrotask(mount);
        else mount();
      },
    );

    onCleanup(clear);
  });

  return claimed === null ? marker : rangeNodes(claimed);
}

function resolveTarget(requested: Node | string | null | undefined): Node | null {
  if (typeof requested === "string") {
    const found = document.querySelector(requested);
    return found instanceof HTMLElement ? found : null;
  }
  if (requested === null || requested === undefined) return document.body;
  return requested;
}
