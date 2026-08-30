/**
 * Focus containment, restoration and the ring.
 *
 * A modal dialog has to trap Tab inside itself, put focus back where it came
 * from when it closes, and cope with being one of several nested traps. The
 * platform offers `inert` for the first, nothing for the second, and nothing
 * at all for the third; `inert` also cannot express "contained but with a
 * child scope allowed to take over", which is what a menu inside a dialog is.
 *
 * So scopes form a tree of their own, parallel to the DOM, and the one that
 * currently owns focus is a module-level fact rather than a per-scope one:
 * a scope opened from inside another must become its child even when it
 * renders through a portal somewhere else entirely.
 */

import {
  type Accessor,
  context,
  effect,
  getContext,
  getOwner,
  install,
  isServer,
  onMount,
  signal,
} from "@barqjs/core";
import { tryCleanup } from "@barqjs/primitives/utils";
import {
  activeElement,
  contains,
  isFocusable,
  isTabbable,
  isShadowDOMEnabled,
  isShadowRoot,
  ownerDocument,
  ownerWindow,
  targetElement,
  TOP_LAYER_ATTRIBUTE,
} from "./dom.ts";
import { focusSafely } from "./interactions/focusable.ts";
import { focused, focusWithin } from "./interactions/focus-events.ts";
import { getInteractionModality, focusVisible } from "./interactions/modality.ts";
import { isAndroid, isChrome } from "./platform.ts";
import { access, mergeProps, type DOMProps, type MaybeAccessor } from "./utils.ts";

// ---------------------------------------------------------------------------
// The tree walker
// ---------------------------------------------------------------------------

export interface FocusWalkerOptions {
  /** Start from here rather than from the currently focused element. */
  from?: Element;
  /** Only elements in the browser's Tab order. */
  tabbable?: boolean;
  /** Wrap around at the ends. */
  wrap?: boolean;
  /** An extra test the element must pass. */
  accept?: (node: Element) => boolean;
}

const ACCEPT = 1;
const REJECT = 2;
const SKIP = 3;

type Verdict = typeof ACCEPT | typeof REJECT | typeof SKIP;

/**
 * The focus order under a root, walked by hand.
 *
 * The platform has `TreeWalker`, and it is not used, for two reasons. It stops
 * at a shadow boundary, so a scope containing a custom element cannot find
 * anything focusable inside it. And its `previousNode` is not implemented
 * consistently: happy-dom returns the root rather than the previous sibling,
 * which silently turns every Shift+Tab and every `focusPrevious` into a wrap.
 * A suite running against it would report focus containment as working when
 * backwards movement is broken.
 *
 * The traversal is the one the DOM standard specifies for `TreeWalker`, with
 * `firstChild` and `parentNode` reading through open shadow roots when
 * {@link enableShadowDOM} is on.
 */
export class FocusWalker {
  currentNode: Node;

  #root: Node;
  #filter: (node: Node) => Verdict;

  constructor(root: Node, filter: (node: Node) => Verdict) {
    this.#root = root;
    this.#filter = filter;
    this.currentNode = root;
  }

  #firstChild(node: Node): Node | null {
    if (isShadowDOMEnabled()) {
      const shadow = (node as Element).shadowRoot;
      if (shadow) return shadow.firstChild;
    }
    return node.firstChild;
  }

  #lastChild(node: Node): Node | null {
    if (isShadowDOMEnabled()) {
      const shadow = (node as Element).shadowRoot;
      if (shadow) return shadow.lastChild;
    }
    return node.lastChild;
  }

  #parent(node: Node): Node | null {
    const parent = node.parentNode;
    if (parent === null) return null;
    if (isShadowDOMEnabled() && isShadowRoot(parent)) return parent.host;
    return parent;
  }

  nextNode(): Node | null {
    let node = this.currentNode;
    let verdict: Verdict = ACCEPT;

    for (;;) {
      while (verdict !== REJECT) {
        const child = this.#firstChild(node);
        if (child === null) break;
        node = child;
        verdict = this.#filter(node);
        if (verdict === ACCEPT) {
          this.currentNode = node;
          return node;
        }
      }

      let following: Node | null = null;
      let at: Node | null = node;
      while (at !== null) {
        if (at === this.#root) return null;
        const sibling = at.nextSibling;
        if (sibling !== null) {
          following = sibling;
          break;
        }
        at = this.#parent(at);
      }
      if (following === null) return null;

      node = following;
      verdict = this.#filter(node);
      if (verdict === ACCEPT) {
        this.currentNode = node;
        return node;
      }
    }
  }

  previousNode(): Node | null {
    let node = this.currentNode;

    while (node !== this.#root) {
      let sibling = node.previousSibling;
      while (sibling !== null) {
        node = sibling;
        let verdict = this.#filter(node);
        // Descend to the deepest acceptable node of this subtree: the previous
        // element in focus order is the LAST one inside the previous sibling,
        // not the sibling itself.
        while (verdict !== REJECT) {
          const child = this.#lastChild(node);
          if (child === null) break;
          node = child;
          verdict = this.#filter(node);
        }
        if (verdict === ACCEPT) {
          this.currentNode = node;
          return node;
        }
        sibling = node.previousSibling;
      }

      const parent = this.#parent(node);
      if (node === this.#root || parent === null) return null;
      node = parent;
      if (this.#filter(node) === ACCEPT) {
        this.currentNode = node;
        return node;
      }
    }

    return null;
  }

  /** The last acceptable node under the root, or null. */
  last(): Node | null {
    const from = this.currentNode;
    this.currentNode = this.#root;
    let found: Node | null = null;
    let node = this.nextNode();
    while (node !== null) {
      found = node;
      node = this.nextNode();
    }
    if (found === null) this.currentNode = from;
    return found;
  }
}

function radiosInGroup(input: HTMLInputElement): HTMLInputElement[] {
  const view = ownerWindow(input);
  if (!input.form) {
    return [
      ...ownerDocument(input).querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${CSS.escape(input.name)}"]`,
      ),
    ].filter((radio) => !radio.form);
  }

  // `namedItem` returns a RadioNodeList for two or more, a single Element for
  // exactly one, and null for none.
  const list = input.form.elements.namedItem(input.name);
  if (list instanceof view.RadioNodeList) {
    return [...list].filter((el): el is HTMLInputElement => el instanceof view.HTMLInputElement);
  }
  if (list instanceof view.HTMLInputElement) return [list];
  return [];
}

/**
 * Whether a radio is the one its group puts in the Tab order: the checked one,
 * or the first when none is checked.
 */
function isTabbableRadio(input: HTMLInputElement): boolean {
  if (input.checked) return true;
  const group = radiosInGroup(input);
  return group.length > 0 && !group.some((radio) => radio.checked);
}

/** A walker over the focusable, or tabbable, elements under `root`. */
export function focusableWalker(
  root: Element,
  options?: FocusWalkerOptions,
  scope?: Element[],
): FocusWalker {
  const match = options?.tabbable === true ? isTabbable : isFocusable;

  const walker = new FocusWalker(root, (node: Node): Verdict => {
    if (node.nodeType !== Node.ELEMENT_NODE) return SKIP;
    const element = node as Element;

    // Everything inside the starting node is behind us.
    if (contains(options?.from, element)) return REJECT;

    if (
      options?.tabbable === true &&
      element.tagName === "INPUT" &&
      element.getAttribute("type") === "radio"
    ) {
      if (!isTabbableRadio(element as HTMLInputElement)) return REJECT;
      const current = walker.currentNode as Element;
      // Two radios of one group are one Tab stop.
      if (
        current.tagName === "INPUT" &&
        (current as HTMLInputElement).type === "radio" &&
        (current as HTMLInputElement).name === (element as HTMLInputElement).name
      ) {
        return REJECT;
      }
    }

    if (
      match(element) &&
      (scope === undefined || isInScope(element, scope)) &&
      (options?.accept === undefined || options.accept(element))
    ) {
      return ACCEPT;
    }

    return SKIP;
  });

  if (options?.from !== undefined) walker.currentNode = options.from;
  return walker;
}

// ---------------------------------------------------------------------------
// The scope tree
// ---------------------------------------------------------------------------

/**
 * The elements between one scope's sentinels.
 *
 * Computed on demand rather than collected once, because the extent of a scope
 * is not fixed: a `Show` inside it swaps its content, and a list adds rows.
 * A collected snapshot goes stale the moment either happens, and the scope
 * then contains focus inside elements that are no longer there.
 *
 * `read` is the reactive form, so an effect binding listeners to these
 * elements re-binds when the set changes; `current` is the plain read, for the
 * scope-tree bookkeeping that must not subscribe to anything.
 */
class ScopeNodes {
  start: Element | null = null;
  end: Element | null = null;

  #version = signal(0);
  #observer: MutationObserver | null = null;

  get current(): Element[] | null {
    if (this.start === null || this.end === null) return null;
    const between: Element[] = [];
    let at = this.start.nextSibling;
    while (at !== null && at !== this.end) {
      if (at.nodeType === Node.ELEMENT_NODE) between.push(at as Element);
      at = at.nextSibling;
    }
    return between;
  }

  read(): Element[] | null {
    this.#version();
    return this.current;
  }

  bump(): void {
    this.#version.update((n) => n + 1);
  }

  /** Re-read when the sentinels' parent gains or loses children. */
  watch(): () => void {
    const parent = this.start?.parentNode;
    if (parent === null || parent === undefined || typeof MutationObserver === "undefined") {
      this.bump();
      return () => {};
    }

    this.#observer = new MutationObserver(() => this.bump());
    this.#observer.observe(parent, { childList: true });
    this.bump();

    return () => {
      this.#observer?.disconnect();
      this.#observer = null;
    };
  }
}

class ScopeNode {
  nodes: ScopeNodes | null;
  restoreTo: HTMLElement | SVGElement | undefined;
  parent: ScopeNode | undefined;
  children = new Set<ScopeNode>();
  contain = false;

  constructor(nodes: ScopeNodes | null) {
    this.nodes = nodes;
  }

  add(child: ScopeNode): void {
    this.children.add(child);
    child.parent = this;
  }

  remove(child: ScopeNode): void {
    this.children.delete(child);
    child.parent = undefined;
  }
}

class ScopeTree {
  root = new ScopeNode(null);
  #byNodes = new Map<ScopeNodes | null, ScopeNode>();

  constructor() {
    this.#byNodes.set(null, this.root);
  }

  get(nodes: ScopeNodes | null): ScopeNode | undefined {
    return this.#byNodes.get(nodes);
  }

  register(node: ScopeNode): void {
    this.#byNodes.set(node.nodes, node);
  }

  attach(nodes: ScopeNodes | null, parent: ScopeNodes | null, restoreTo?: HTMLElement): void {
    const parentNode = this.#byNodes.get(parent ?? null);
    if (parentNode === undefined) return;
    const node = new ScopeNode(nodes);
    parentNode.add(node);
    this.#byNodes.set(nodes, node);
    if (restoreTo !== undefined) node.restoreTo = restoreTo;
  }

  remove(nodes: ScopeNodes | null): void {
    if (nodes === null) return;
    const node = this.#byNodes.get(nodes);
    if (node === undefined) return;

    // A sibling scope restoring focus INTO the scope being removed has to
    // inherit this one's target instead, or focus lands on a detached node.
    for (const other of this.walk()) {
      if (
        other !== node &&
        node.restoreTo !== undefined &&
        other.restoreTo !== undefined &&
        node.nodes?.current !== undefined &&
        node.nodes.current !== null &&
        isInScope(other.restoreTo, node.nodes.current)
      ) {
        other.restoreTo = node.restoreTo;
      }
    }

    const parent = node.parent;
    if (parent !== undefined) {
      parent.remove(node);
      for (const child of node.children) parent.add(child);
    }

    this.#byNodes.delete(node.nodes);
  }

  *walk(from: ScopeNode = this.root): Generator<ScopeNode> {
    if (from.nodes !== null) yield from;
    for (const child of from.children) yield* this.walk(child);
  }

  clone(): ScopeTree {
    const copy = new ScopeTree();
    for (const node of this.walk()) {
      copy.attach(
        node.nodes,
        node.parent?.nodes ?? null,
        node.restoreTo as HTMLElement | undefined,
      );
    }
    return copy;
  }
}

const scopeTree = new ScopeTree();
let activeScope: ScopeNodes | null = null;

const RESTORE_EVENT = "barq-focus-scope-restore";

function isInScope(element: Element | null | undefined, scope: Element[] | null): boolean {
  if (element === null || element === undefined || scope === null) return false;
  return scope.some((node) => contains(node, element));
}

function isInAnyChildScope(element: Element, from: ScopeNodes | null = null): boolean {
  // The top layer is above every scope, so focus is always allowed there.
  if (element instanceof Element && element.closest(`[${TOP_LAYER_ATTRIBUTE}]`) !== null) {
    return true;
  }

  // `contains` covers child scopes that are DOM descendants; the walk covers
  // the ones rendered through a portal.
  for (const node of scopeTree.walk(scopeTree.get(from) ?? scopeTree.root)) {
    if (node.nodes !== null && isInScope(element, node.nodes.current)) return true;
  }
  return false;
}

function isAncestorScope(ancestor: ScopeNodes | null, scope: ScopeNodes | null): boolean {
  let parent = scopeTree.get(scope)?.parent;
  while (parent !== undefined) {
    if (parent.nodes === ancestor) return true;
    parent = parent.parent;
  }
  return false;
}

/**
 * Whether this scope may act on a focus event, given which scope is active.
 *
 * A contained scope between the active one and this one owns focus, so an
 * ancestor must not pull it out.
 */
function shouldContainFocus(scope: ScopeNodes): boolean {
  let node = scopeTree.get(activeScope);
  while (node !== undefined && node.nodes !== scope) {
    if (node.contain) return false;
    node = node.parent;
  }
  return true;
}

function shouldRestoreFocus(scope: ScopeNodes): boolean {
  let node = scopeTree.get(activeScope);
  while (node !== undefined && node.nodes !== scope) {
    if (node.restoreTo !== undefined) return false;
    node = node.parent;
  }
  return node?.nodes === scope;
}

function focusElement(element: Element | null, scroll = false): void {
  if (element === null) return;
  try {
    if (scroll) (element as HTMLElement).focus();
    else focusSafely(element as HTMLElement);
  } catch {
    // A detached or non-focusable element; nothing to do.
  }
}

function scopeRoot(scope: Element[]): Element {
  return scope[0]?.parentElement as Element;
}

function firstInScope(scope: Element[], tabbable = true): Element | null {
  const sentinel = scope[0]?.previousElementSibling;
  if (sentinel === null || sentinel === undefined) return null;

  let walker = focusableWalker(scopeRoot(scope), { tabbable }, scope);
  walker.currentNode = sentinel;
  let next = walker.nextNode();

  // Nothing tabbable does not mean nothing focusable.
  if (tabbable && next === null) {
    walker = focusableWalker(scopeRoot(scope), { tabbable: false }, scope);
    walker.currentNode = sentinel;
    next = walker.nextNode();
  }

  return next as Element | null;
}

// ---------------------------------------------------------------------------
// The focus manager
// ---------------------------------------------------------------------------

export interface FocusManager {
  focusNext(options?: FocusWalkerOptions): Element | null;
  focusPrevious(options?: FocusWalkerOptions): Element | null;
  focusFirst(options?: FocusWalkerOptions): Element | null;
  focusLast(options?: FocusWalkerOptions): Element | null;
}

interface FocusScopeContextValue {
  manager: FocusManager;
  node: ScopeNode;
}

const FocusScopeContext = context<FocusScopeContextValue | null>(null);

/** The manager for the nearest enclosing {@link focusScope}. */
export function focusManager(): FocusManager | undefined {
  return getContext(FocusScopeContext)?.manager;
}

function last(walker: FocusWalker): Element | null {
  return walker.last() as Element | null;
}

function managerForScope(nodes: ScopeNodes): FocusManager {
  const scopeOf = (): Element[] | null => nodes.current;

  return {
    focusNext(options = {}) {
      const scope = scopeOf();
      if (scope === null || scope.length === 0) return null;
      const { from, tabbable, wrap, accept } = options;
      const start = from ?? activeElement(ownerDocument(scope[0]));
      const sentinel = scope[0]?.previousElementSibling as Element;
      const walker = focusableWalker(scopeRoot(scope), { tabbable, accept }, scope);
      walker.currentNode = isInScope(start, scope) ? (start as Element) : sentinel;
      let next = walker.nextNode() as Element | null;
      if (next === null && wrap === true) {
        walker.currentNode = sentinel;
        next = walker.nextNode() as Element | null;
      }
      if (next !== null) focusElement(next, true);
      return next;
    },

    focusPrevious(options = {}) {
      const scope = scopeOf();
      if (scope === null || scope.length === 0) return null;
      const { from, tabbable, wrap, accept } = options;
      const start = from ?? activeElement(ownerDocument(scope[0]));
      const sentinel = scope[scope.length - 1]?.nextElementSibling as Element;
      const walker = focusableWalker(scopeRoot(scope), { tabbable, accept }, scope);
      walker.currentNode = isInScope(start, scope) ? (start as Element) : sentinel;
      let previous = walker.previousNode() as Element | null;
      if (previous === null && wrap === true) {
        walker.currentNode = sentinel;
        previous = walker.previousNode() as Element | null;
      }
      if (previous !== null) focusElement(previous, true);
      return previous;
    },

    focusFirst(options = {}) {
      const scope = scopeOf();
      if (scope === null || scope.length === 0) return null;
      const walker = focusableWalker(
        scopeRoot(scope),
        { tabbable: options.tabbable, accept: options.accept },
        scope,
      );
      walker.currentNode = scope[0]?.previousElementSibling as Element;
      const next = walker.nextNode() as Element | null;
      if (next !== null) focusElement(next, true);
      return next;
    },

    focusLast(options = {}) {
      const scope = scopeOf();
      if (scope === null || scope.length === 0) return null;
      const walker = focusableWalker(
        scopeRoot(scope),
        { tabbable: options.tabbable, accept: options.accept },
        scope,
      );
      walker.currentNode = scope[scope.length - 1]?.nextElementSibling as Element;
      const previous = walker.previousNode() as Element | null;
      if (previous !== null) focusElement(previous, true);
      return previous;
    },
  };
}

/**
 * A focus manager over one element's subtree, with no scope tree involved.
 *
 * For a composite widget moving focus among its own children — a toolbar, a
 * tab list — where nothing needs containing or restoring.
 */
export function createFocusManager(
  ref: MaybeAccessor<Element | null | undefined>,
  defaults: FocusWalkerOptions = {},
): FocusManager {
  const rootOf = (): Element | null => (access(ref) as Element | null) ?? null;

  return {
    focusNext(options = {}) {
      const root = rootOf();
      if (root === null) return null;
      const {
        from,
        tabbable = defaults.tabbable,
        wrap = defaults.wrap,
        accept = defaults.accept,
      } = options;
      const start = from ?? activeElement(ownerDocument(root));
      const walker = focusableWalker(root, { tabbable, accept });
      if (contains(root, start)) walker.currentNode = start as Element;
      let next = walker.nextNode() as Element | null;
      if (next === null && wrap === true) {
        walker.currentNode = root;
        next = walker.nextNode() as Element | null;
      }
      if (next !== null) focusElement(next, true);
      return next;
    },

    focusPrevious(options = {}) {
      const root = rootOf();
      if (root === null) return null;
      const {
        from,
        tabbable = defaults.tabbable,
        wrap = defaults.wrap,
        accept = defaults.accept,
      } = options;
      const start = from ?? activeElement(ownerDocument(root));
      const walker = focusableWalker(root, { tabbable, accept });
      if (!contains(root, start)) {
        const next = last(walker);
        if (next !== null) focusElement(next, true);
        return next;
      }
      walker.currentNode = start as Element;
      let previous = walker.previousNode() as Element | null;
      if (previous === null && wrap === true) {
        walker.currentNode = root;
        previous = last(walker);
      }
      if (previous !== null) focusElement(previous, true);
      return previous;
    },

    focusFirst(options = {}) {
      const root = rootOf();
      if (root === null) return null;
      const walker = focusableWalker(root, {
        tabbable: options.tabbable ?? defaults.tabbable,
        accept: options.accept ?? defaults.accept,
      });
      const next = walker.nextNode() as Element | null;
      if (next !== null) focusElement(next, true);
      return next;
    },

    focusLast(options = {}) {
      const root = rootOf();
      if (root === null) return null;
      const walker = focusableWalker(root, {
        tabbable: options.tabbable ?? defaults.tabbable,
        accept: options.accept ?? defaults.accept,
      });
      const next = last(walker);
      if (next !== null) focusElement(next, true);
      return next;
    },
  };
}

// ---------------------------------------------------------------------------
// focusScope
// ---------------------------------------------------------------------------

export interface FocusScopeOptions {
  /** Keep Tab inside the scope. */
  contain?: MaybeAccessor<boolean | undefined>;
  /** Put focus back where it was when the scope goes away. */
  restoreFocus?: MaybeAccessor<boolean | undefined>;
  /** Focus the first tabbable element on mount. */
  autoFocus?: MaybeAccessor<boolean | undefined>;
}

export interface FocusScopeResult {
  /** Ref for the sentinel before the scope's contents. */
  startRef: (element: Element | null) => void;
  /** Ref for the sentinel after the scope's contents. */
  endRef: (element: Element | null) => void;
  /** Programmatic focus movement within the scope. */
  manager: FocusManager;
  /** Re-read which elements lie between the sentinels. */
  refresh: () => void;
}

/**
 * A region that owns focus.
 *
 * The two sentinels delimit it: everything between them is the scope, which is
 * how a scope whose content is a fragment, or changes shape, still has an
 * unambiguous extent. Render them hidden, immediately around the content.
 *
 * ```tsx
 * const scope = focusScope({ contain: true, restoreFocus: true, autoFocus: true });
 * <>
 *   <span hidden ref={scope.startRef} />
 *   {props.children}
 *   <span hidden ref={scope.endRef} />
 * </>
 * ```
 */
export function focusScope(options: FocusScopeOptions = {}): FocusScopeResult {
  const nodes = new ScopeNodes();
  const parentContext = getContext(FocusScopeContext);
  const node = new ScopeNode(nodes);
  const manager = managerForScope(nodes);

  /**
   * Where focus goes when the scope is disposed.
   *
   * Captured when the scope's content MOUNTS rather than when the hook is
   * called, and the difference is the whole point: an overlay's scope is
   * created with its component and opened much later, so reading focus here
   * would record whatever had it at mount. A submenu opened from a menu item
   * then restored focus to the MENU, not to the item that opened it.
   *
   * Still before any child with `autoFocus` can take focus away, because the
   * sentinel's ref runs before the content between the sentinels is built.
   *
   * A signal, because the effect below copies it onto the scope node and has
   * to run again when a scope that was created closed reopens.
   */
  const restoreTo = signal<HTMLElement | SVGElement | null>(null);

  const stopEvent = (event: Event): void => event.stopPropagation();

  if (isServer) {
    return {
      startRef: () => {},
      endRef: () => {},
      manager,
      refresh: () => {},
    };
  }

  /**
   * A scope that opens while another is active belongs UNDER that one, even
   * when the context says otherwise: a dialog launched from a menu is a child
   * of the menu's scope, not of whatever wraps its portal.
   *
   * Resolved twice — here, and again when the scope's content MOUNTS. An
   * overlay's scope is created with its component and opened much later, so at
   * this point `activeScope` is whatever was active when the component was
   * built, which for a submenu is nothing at all. Getting it wrong puts the
   * scope beside its parent rather than under it, and focus restoration then
   * refuses to run because the disposing scope is not the active one.
   */
  const parentOf = (): ScopeNode => {
    let found = parentContext?.node ?? scopeTree.root;
    if (
      scopeTree.get(found.nodes) !== undefined &&
      activeScope !== null &&
      !isAncestorScope(activeScope, found.nodes)
    ) {
      const active = scopeTree.get(activeScope);
      if (active !== undefined) found = active;
    }
    return found;
  };

  parentOf().add(node);
  scopeTree.register(node);

  effect(() => {
    node.contain = access(options.contain) === true;
  });

  const startRef = (element: Element | null): void => {
    if (element !== null && nodes.start === null) {
      restoreTo.set(activeElement(ownerDocument(element)) as HTMLElement | SVGElement | null);
      const now = parentOf();
      if (now !== node.parent && now !== node) {
        node.parent?.remove(node);
        now.add(node);
      }
    }
    nodes.start = element;
  };

  const endRef = (element: Element | null): void => {
    nodes.end = element;
  };

  // The sentinels are siblings only once the fragment holding them has been
  // inserted, which is after the refs have run.
  onMount(() => {
    tryCleanup(nodes.watch());
  });

  // A restore inside a nested scope must not reach this one.
  effect(() => {
    const scope = nodes.read();
    if (scope === null) return undefined;
    for (const element of scope) element.addEventListener(RESTORE_EVENT, stopEvent);
    return () => {
      for (const element of scope) element.removeEventListener(RESTORE_EVENT, stopEvent);
    };
  });

  // Published to the subtree, so a nested scope parents itself here and a
  // descendant can reach this scope's manager.
  const owner = getOwner();
  if (owner !== null) {
    const value: FocusScopeContextValue = { manager, node };
    install(owner, FocusScopeContext, () => value);
  }

  containFocus(nodes, options);
  restoreFocusOnDispose(nodes, options, restoreTo);
  trackActiveScope(nodes, options);
  autoFocusOnMount(nodes, options);

  tryCleanup(() => {
    const parentScope = scopeTree.get(nodes)?.parent?.nodes ?? null;
    if (
      (nodes === activeScope || isAncestorScope(nodes, activeScope)) &&
      (parentScope === null || scopeTree.get(parentScope) !== undefined)
    ) {
      activeScope = parentScope;
    }
    scopeTree.remove(nodes);
  });

  return { startRef, endRef, manager, refresh: () => nodes.bump() };
}

function containFocus(nodes: ScopeNodes, options: FocusScopeOptions): void {
  let focusedNode: Element | undefined;
  let frame: number | undefined;

  effect(() => {
    const scope = nodes.read();
    if (access(options.contain) !== true) {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
        frame = undefined;
      }
      return undefined;
    }

    const doc = ownerDocument(scope?.[0]);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key !== "Tab" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !shouldContainFocus(nodes) ||
        event.isComposing
      ) {
        return undefined;
      }

      const current = activeElement(doc);
      const live = nodes.current;
      if (live === null || live.length === 0 || !isInScope(current, live)) return;

      const walker = focusableWalker(scopeRoot(live), { tabbable: true }, live);
      if (current === null) return;
      walker.currentNode = current;
      let next = (event.shiftKey ? walker.previousNode() : walker.nextNode()) as Element | null;

      if (next === null) {
        walker.currentNode = (
          event.shiftKey
            ? live[live.length - 1]?.nextElementSibling
            : live[0]?.previousElementSibling
        ) as Element;
        next = (event.shiftKey ? walker.previousNode() : walker.nextNode()) as Element | null;
      }

      event.preventDefault();
      if (next !== null) {
        focusElement(next, true);
        if (next instanceof ownerWindow(next).HTMLInputElement) next.select();
      }
    };

    const onFocus = (event: Event): void => {
      const target = targetElement(event);
      if (
        (activeScope === null || isAncestorScope(activeScope, nodes)) &&
        isInScope(target, nodes.current)
      ) {
        // A child scope taking focus becomes the active one; moving out to an
        // ancestor is not allowed.
        activeScope = nodes;
        focusedNode = target ?? undefined;
      } else if (
        shouldContainFocus(nodes) &&
        target !== null &&
        !isInAnyChildScope(target, nodes)
      ) {
        // Focus arrived from outside the scope entirely, e.g. the user tabbed
        // in from the browser's address bar.
        if (focusedNode !== undefined) focusElement(focusedNode);
        else if (activeScope?.current !== undefined && activeScope.current !== null) {
          focusElement(firstInScope(activeScope.current));
        }
      } else if (shouldContainFocus(nodes)) {
        focusedNode = target ?? undefined;
      }
    };

    const onBlur = (event: Event): void => {
      // Firefox does not put focus back without the frame.
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // TalkBack on Chrome cannot move its virtual cursor out of a contained
        // scope, and coerces focus back forever. Focus is allowed to leave
        // there, which is narrower than it sounds: only that combination.
        const how = getInteractionModality();
        const skip = (how === "virtual" || how === null) && isAndroid() && isChrome();

        const active = activeElement(doc);
        if (
          skip ||
          active === null ||
          !shouldContainFocus(nodes) ||
          isInAnyChildScope(active, nodes)
        ) {
          return;
        }

        activeScope = nodes;
        const target = targetElement(event);
        if (target !== null && target.isConnected) {
          focusedNode = target;
          focusElement(focusedNode);
        } else if (activeScope.current !== null) {
          focusElement(firstInScope(activeScope.current));
        }
      });
    };

    doc.addEventListener("keydown", onKeyDown as EventListener, false);
    doc.addEventListener("focusin", onFocus, false);
    for (const element of scope ?? []) {
      element.addEventListener("focusin", onFocus, false);
      element.addEventListener("focusout", onBlur, false);
    }

    return () => {
      doc.removeEventListener("keydown", onKeyDown as EventListener, false);
      doc.removeEventListener("focusin", onFocus, false);
      for (const element of scope ?? []) {
        element.removeEventListener("focusin", onFocus, false);
        element.removeEventListener("focusout", onBlur, false);
      }
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  });
}

function trackActiveScope(nodes: ScopeNodes, options: FocusScopeOptions): void {
  effect(() => {
    const scope = nodes.read();
    // Containment and restoration each track this themselves.
    if (access(options.restoreFocus) === true || access(options.contain) === true) return undefined;

    const doc = ownerDocument(scope?.[0]);

    const onFocus = (event: Event): void => {
      const target = targetElement(event);
      if (target === null) return;
      if (isInScope(target, nodes.current)) activeScope = nodes;
      else if (!isInAnyChildScope(target)) activeScope = null;
    };

    doc.addEventListener("focusin", onFocus, false);
    for (const element of scope ?? []) element.addEventListener("focusin", onFocus, false);

    return () => {
      doc.removeEventListener("focusin", onFocus, false);
      for (const element of scope ?? []) element.removeEventListener("focusin", onFocus, false);
    };
  });
}

function autoFocusOnMount(nodes: ScopeNodes, options: FocusScopeOptions): void {
  const pending = signal(access(options.autoFocus) === true);

  effect(() => {
    const scope = nodes.read();
    if (!pending()) return;
    if (scope === null || scope.length === 0) return;
    pending.set(false);

    activeScope = nodes;
    const doc = ownerDocument(scope[0]);
    if (!isInScope(activeElement(doc), scope)) focusElement(firstInScope(scope));
  });
}

function restoreFocusOnDispose(
  nodes: ScopeNodes,
  options: FocusScopeOptions,
  restoreTo: Accessor<HTMLElement | SVGElement | null>,
): void {
  // A restoring scope that is not containing still has to know when it becomes
  // active, so it can decide whether the restore is its to perform.
  effect(() => {
    const scope = nodes.read();
    if (access(options.restoreFocus) !== true || access(options.contain) === true) return undefined;

    const doc = ownerDocument(scope?.[0]);

    const onFocus = (): void => {
      if (
        (activeScope === null || isAncestorScope(activeScope, nodes)) &&
        isInScope(activeElement(doc), nodes.current)
      ) {
        activeScope = nodes;
      }
    };

    doc.addEventListener("focusin", onFocus, false);
    for (const element of scope ?? []) element.addEventListener("focusin", onFocus, false);

    return () => {
      doc.removeEventListener("focusin", onFocus, false);
      for (const element of scope ?? []) element.removeEventListener("focusin", onFocus, false);
    };
  });

  // Tabbing out of a restoring scope goes to what follows the element focus
  // came from, not to what follows the scope in the DOM. For an overlay in a
  // portal at the end of the body those are very different places.
  effect(() => {
    if (access(options.restoreFocus) !== true || access(options.contain) === true) return undefined;

    const doc = ownerDocument(nodes.current?.[0]);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key !== "Tab" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !shouldContainFocus(nodes) ||
        event.isComposing
      ) {
        return undefined;
      }

      const current = doc.activeElement;
      if (current === null) return;
      if (!isInAnyChildScope(current, nodes) || !shouldRestoreFocus(nodes)) return;

      const scopeNode = scopeTree.get(nodes);
      if (scopeNode === undefined) return;

      let target = scopeNode.restoreTo;
      const walker = focusableWalker(doc.body, { tabbable: true });
      walker.currentNode = current;
      let next = (event.shiftKey ? walker.previousNode() : walker.nextNode()) as Element | null;

      if (target === undefined || !target.isConnected || (target as Element) === doc.body) {
        target = undefined;
        scopeNode.restoreTo = undefined;
      }

      if ((next === null || !isInAnyChildScope(next, nodes)) && target !== undefined) {
        walker.currentNode = target;
        // Step over the scope itself, in case it immediately follows.
        do {
          next = (event.shiftKey ? walker.previousNode() : walker.nextNode()) as Element | null;
        } while (next !== null && isInAnyChildScope(next, nodes));

        event.preventDefault();
        event.stopPropagation();
        if (next !== null) {
          focusElement(next, true);
        } else if (!isInAnyChildScope(target)) {
          // Leaving the outermost scope with nowhere to go: the browser chrome
          // is next, so give focus up entirely.
          (current as HTMLElement).blur();
        } else {
          focusElement(target, true);
        }
      }
    };

    doc.addEventListener("keydown", onKeyDown as EventListener, true);
    return () => doc.removeEventListener("keydown", onKeyDown as EventListener, true);
  });

  effect(() => {
    if (access(options.restoreFocus) !== true) return;

    const scopeNode = scopeTree.get(nodes);
    const value = restoreTo();
    if (scopeNode === undefined) return;
    scopeNode.restoreTo = value ?? undefined;
  });

  tryCleanup(() => {
    if (access(options.restoreFocus) !== true) return;

    const doc = ownerDocument(nodes.current?.[0]);
    const scopeNode = scopeTree.get(nodes);
    const target = scopeNode?.restoreTo;
    const active = activeElement(doc);

    if (
      target === undefined ||
      !(
        (active !== null && isInAnyChildScope(active, nodes)) ||
        (active === doc.body && shouldRestoreFocus(nodes))
      )
    ) {
      return;
    }

    // The tree is about to lose these nodes, so the search has to run against
    // a copy taken now.
    const frozen = scopeTree.clone();
    requestAnimationFrame(() => {
      // Only when focus actually fell to the body. Anything else means
      // something deliberately moved it.
      if (doc.activeElement !== doc.body) return;

      let at = frozen.get(nodes);
      while (at !== undefined) {
        if (at.restoreTo !== undefined && at.restoreTo.isConnected) {
          restoreFocusTo(at.restoreTo);
          return;
        }
        at = at.parent;
      }

      at = frozen.get(nodes);
      while (at !== undefined) {
        if (
          at.nodes?.current !== undefined &&
          at.nodes.current !== null &&
          scopeTree.get(at.nodes) !== undefined
        ) {
          const first = firstInScope(at.nodes.current, true);
          if (first !== null) {
            restoreFocusTo(first as HTMLElement);
            return;
          }
        }
        at = at.parent;
      }
    });
  });
}

/**
 * Restore focus, announcing it first.
 *
 * A virtualised collection reuses its DOM nodes, so the element focus came
 * from may still exist while representing a different item. The event lets an
 * ancestor cancel and put focus somewhere it chooses instead.
 */
function restoreFocusTo(element: HTMLElement | SVGElement): void {
  const proceed = element.dispatchEvent(
    new CustomEvent(RESTORE_EVENT, { bubbles: true, cancelable: true }),
  );
  if (proceed) focusElement(element);
}

/** The context value a focus scope publishes, for nested scopes to find. */
export { FocusScopeContext };

// ---------------------------------------------------------------------------
// focusRing
// ---------------------------------------------------------------------------

export interface FocusRingOptions {
  /** Watch the whole subtree rather than the element itself. */
  within?: MaybeAccessor<boolean | undefined>;
  /** Whether the element is a text input, where only Tab and Escape ring it. */
  isTextInput?: MaybeAccessor<boolean | undefined>;
  autoFocus?: MaybeAccessor<boolean | undefined>;
}

export interface FocusRingResult {
  focusProps: DOMProps;
  /** Whether the element has focus at all. */
  isFocused: Accessor<boolean>;
  /** Whether a ring should be drawn: focused, and not reached by pointer. */
  isFocusVisible: Accessor<boolean>;
}

/**
 * Whether to draw a focus ring.
 *
 * `:focus-visible` cannot answer this for a widget: it applies to the focused
 * element, and the ring usually belongs on a wrapper; and its heuristic for a
 * text input rings on every keystroke.
 *
 * ```tsx
 * const { focusProps, isFocusVisible } = focusRing();
 * <button {...focusProps} data-focus-visible={isFocusVisible} />
 * ```
 */
export function focusRing(options: FocusRingOptions = {}): FocusRingResult {
  const within = (): boolean => access(options.within) === true;

  const visible = focusVisible({
    isTextInput: access(options.isTextInput),
    autoFocus: access(options.autoFocus),
  });

  // Both are created and both are gated, rather than one being chosen here:
  // `within` may be an accessor, and a props object chosen at call time could
  // not follow it.
  const element = focused({ isDisabled: within });
  const subtree = focusWithin({ isDisabled: () => !within() });

  const isFocused = (): boolean => (within() ? subtree.isFocusWithin() : element.isFocused());

  return {
    isFocused,
    isFocusVisible: () => isFocused() && visible(),
    focusProps: mergeProps(element.focusProps, subtree.focusWithinProps),
  };
}
