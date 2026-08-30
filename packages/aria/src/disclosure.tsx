/**
 * A disclosure: a button that shows and hides one panel, and an accordion of
 * several.
 *
 * The panel is `hidden="until-found"` rather than removed. That is the whole
 * reason to prefer it over a conditional: the browser's own find-in-page
 * searches a `until-found` subtree, scrolls to a match and fires `beforematch`
 * so the disclosure can open itself. Content the user cannot search for is
 * content they cannot find, and Ctrl+F is how most people navigate a long
 * page.
 *
 * `aria-expanded` on the button and `aria-controls` pointing at the panel are
 * what make the pair a disclosure rather than a button beside a div. The panel
 * points back with `aria-labelledby`, so a screen reader entering it knows
 * what it is a panel of.
 *
 * An accordion is disclosures sharing one state. Whether more than one may be
 * open at a time is the caller's decision and not ARIA's: `allowsMultiple`.
 */

import {
  type Accessor,
  type Child,
  For,
  context,
  effect,
  getContext,
  getOwner,
  type Incoming,
  install,
  isServer,
  provide,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button, type ButtonOptions } from "./button.tsx";
import type { ItemAccessors, Key, Node } from "./collections.ts";
import { buildCollection, type ListCollection } from "./collections.ts";
import { focusRing } from "./focus.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef, PressEvent } from "./interactions/press.ts";
import {
  access,
  controllable,
  fromProps,
  id,
  mergeProps,
  styleProps,
  type DOMProps,
  type MaybeAccessor,
  type StyleProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface DisclosureStateOptions {
  isExpanded?: MaybeAccessor<boolean | undefined>;
  defaultExpanded?: MaybeAccessor<boolean | undefined>;
  onExpandedChange?: (isExpanded: boolean) => void;
}

export interface DisclosureState {
  isExpanded: Accessor<boolean>;
  setExpanded(isExpanded: boolean): void;
  expand(): void;
  collapse(): void;
  toggle(): void;
}

export function disclosureState(options: DisclosureStateOptions = {}): DisclosureState {
  const [isExpanded, setExpanded] = controllable<boolean>(
    () => access(options.isExpanded),
    () => access(options.defaultExpanded) ?? false,
    options.onExpandedChange,
  );

  return {
    isExpanded,
    setExpanded,
    expand: () => setExpanded(true),
    collapse: () => setExpanded(false),
    toggle: () => setExpanded(!isExpanded()),
  };
}

export interface DisclosureGroupStateOptions {
  expandedKeys?: MaybeAccessor<Iterable<Key> | undefined>;
  defaultExpandedKeys?: MaybeAccessor<Iterable<Key> | undefined>;
  /** Let more than one panel be open at once. @default false */
  allowsMultiple?: MaybeAccessor<boolean | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  onExpandedChange?: (keys: Set<Key>) => void;
}

export interface DisclosureGroupState {
  expandedKeys: Accessor<Set<Key>>;
  allowsMultiple: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  toggleKey(key: Key): void;
  setExpandedKeys(keys: Set<Key>): void;
}

/** Several disclosures sharing which of them is open. */
export function disclosureGroupState(
  options: DisclosureGroupStateOptions = {},
): DisclosureGroupState {
  const [expandedKeys, setExpandedKeys] = controllable<Set<Key>>(
    () => {
      const given = access(options.expandedKeys);
      return given === undefined ? undefined : new Set(given);
    },
    () => new Set(access(options.defaultExpandedKeys) ?? []),
    options.onExpandedChange,
  );

  const allowsMultiple = (): boolean => access(options.allowsMultiple) === true;

  return {
    expandedKeys,
    allowsMultiple,
    isDisabled: () => access(options.isDisabled) === true,
    setExpandedKeys,
    toggleKey: (key) => {
      const open = expandedKeys();
      if (open.has(key)) {
        const next = new Set(open);
        next.delete(key);
        setExpandedKeys(next);
        return;
      }
      // Closing the others is the DEFAULT: an accordion whose panels all open
      // at once is a list of disclosures, and the caller says so.
      setExpandedKeys(allowsMultiple() ? new Set([...open, key]) : new Set([key]));
    },
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface DisclosureOptions {
  panelRef: ElementRef;
  isDisabled?: MaybeAccessor<boolean | undefined>;
}

export interface DisclosureResult {
  /** Options for {@link button}, not props for an element. */
  buttonProps: DOMProps;
  panelProps: DOMProps;
}

export function disclosure(options: DisclosureOptions, state: DisclosureState): DisclosureResult {
  const triggerId = id();
  const panelId = id();
  const isDisabled = (): boolean => access(options.isDisabled) === true;

  if (!isServer) {
    /**
     * Find-in-page opens it.
     *
     * The browser strips `hidden` before firing `beforematch`, so the
     * attribute is put back and the state told to open: without that the panel
     * is visible while the state still says it is closed, and the next toggle
     * closes nothing.
     */
    effect(() => {
      const panel = access(options.panelRef) as HTMLElement | null;
      if (panel === null) return undefined;
      const onBeforeMatch = (): void => {
        panel.setAttribute("hidden", "until-found");
        state.expand();
      };
      panel.addEventListener("beforematch", onBeforeMatch);
      return () => panel.removeEventListener("beforematch", onBeforeMatch);
    });

    // `until-found`, not `true`: the panel stays searchable while it is shut.
    effect(() => {
      const panel = access(options.panelRef) as HTMLElement | null;
      if (panel === null) return;
      if (state.isExpanded()) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "until-found");
    });
  }

  return {
    buttonProps: {
      id: triggerId,
      isDisabled: options.isDisabled,
      "aria-expanded": () => state.isExpanded(),
      "aria-controls": panelId,
      // On press for a pointer, on press START for a key: a keyboard toggle
      // that waited for the key to come up would feel a frame late next to
      // everything else the platform does on key down.
      onPress: (event: PressEvent) => {
        if (isDisabled() || event.pointerType === "keyboard") return;
        state.toggle();
      },
      onPressStart: (event: PressEvent) => {
        if (isDisabled() || event.pointerType !== "keyboard") return;
        state.toggle();
      },
    },
    panelProps: {
      id: panelId,
      role: "group",
      "aria-labelledby": triggerId,
      // On the SERVER the attribute is all there is: the effects above have
      // not run, and a panel rendered without it would flash open.
      hidden: () => (isServer ? (state.isExpanded() ? undefined : "until-found") : undefined),
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface DisclosureContextValue {
  state: DisclosureState;
  buttonProps: DOMProps;
  panelProps: DOMProps;
  panelRef: ReturnType<typeof makeRef<HTMLDivElement>>;
}

const DisclosureContext = context<DisclosureContextValue | null>(null);

export function useDisclosure(): DisclosureContextValue {
  const value = getContext(DisclosureContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a Disclosure.");
  }
  return value;
}

export interface DisclosureComponentProps extends StyleProps {
  children?: Child;
  isExpanded?: boolean;
  defaultExpanded?: boolean;
  isDisabled?: boolean;
  onExpandedChange?: (isExpanded: boolean) => void;
}

/**
 * ```tsx
 * <Disclosure>
 *   <DisclosureButton>Details</DisclosureButton>
 *   <DisclosurePanel>Everything else</DisclosurePanel>
 * </Disclosure>
 * ```
 */
export function Disclosure(props: Incoming<DisclosureComponentProps>) {
  const panelRef = makeRef<HTMLDivElement>();
  const options = fromProps(props);
  const state = disclosureState(options);

  const { buttonProps, panelProps } = disclosure(
    { panelRef, isDisabled: () => props.isDisabled?.() },
    state,
  );

  const value: DisclosureContextValue = { state, buttonProps, panelProps, panelRef };
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;

  return provide(
    owner,
    DisclosureContext,
    () => value,
    () => props.children as unknown,
  ) as never;
}

export interface DisclosureButtonComponentProps extends StyleProps {
  children?: Child;
  isDisabled?: boolean;
  ref?: RefTarget<HTMLButtonElement>;
}

export function DisclosureButton(props: Incoming<DisclosureButtonComponentProps>) {
  const domRef = makeRef<HTMLButtonElement>();
  const value = useDisclosure();

  const { buttonProps, isPressed } = button(
    { ...(fromProps(props) as ButtonOptions), ...value.buttonProps },
    domRef,
  );
  const { hoverProps, isHovered } = hover({ isDisabled: () => props.isDisabled?.() });
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    buttonProps,
    { id: value.buttonProps.id },
    hoverProps,
    focusProps,
    styleProps(props),
    {
      "data-expanded": value.state.isExpanded,
      "data-pressed": isPressed,
      "data-hovered": isHovered,
      "data-focus-visible": isFocusVisible,
      "data-disabled": () => props.isDisabled?.() === true,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <button {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
      {props.children}
    </button>
  );
}

export interface DisclosurePanelComponentProps extends StyleProps {
  children?: Child;
  ref?: RefTarget<HTMLDivElement>;
}

/**
 * The panel. Still in the document while collapsed, so find-in-page can reach
 * it and open the disclosure it belongs to.
 */
export function DisclosurePanel(props: Incoming<DisclosurePanelComponentProps>) {
  const value = useDisclosure();

  const elementProps = mergeProps(value.panelProps, styleProps(props), {
    "data-expanded": value.state.isExpanded,
    "data-testid": () => props["data-testid"]?.(),
  });

  return (
    <div {...elementProps} ref={mergeRefs(value.panelRef.set, props.ref?.())}>
      {props.children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A group of them
// ---------------------------------------------------------------------------

interface DisclosureGroupContextValue {
  state: DisclosureGroupState;
}

const DisclosureGroupContext = context<DisclosureGroupContextValue | null>(null);
const DisclosureNodeContext = context<Node<unknown> | null>(null);

export function useDisclosureGroup(): DisclosureGroupContextValue {
  const value = getContext(DisclosureGroupContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a DisclosureGroup.");
  }
  return value;
}

/** The collection node the section being built is for. */
export function useDisclosureNode(): Node<unknown> {
  const node = getContext(DisclosureNodeContext);
  if (node === null || node === undefined) {
    throw new Error("This must be rendered inside a DisclosureGroup's item callback.");
  }
  return node;
}

export interface DisclosureGroupComponentProps<T> extends StyleProps, ItemAccessors<T> {
  /** The sections, in order. */
  items: Iterable<T>;
  /** How one section renders. Return a `<DisclosureGroupItem>`. */
  children: (item: T) => Child;
  expandedKeys?: Iterable<Key>;
  defaultExpandedKeys?: Iterable<Key>;
  /** @default false */
  allowsMultiple?: boolean;
  isDisabled?: boolean;
  ref?: RefTarget<HTMLDivElement>;
  onExpandedChange?: (keys: Set<Key>) => void;
}

/**
 * An accordion.
 *
 * ```tsx
 * <DisclosureGroup items={sections()}>
 *   {(section) => (
 *     <DisclosureGroupItem>
 *       <DisclosureButton>{section.name}</DisclosureButton>
 *       <DisclosurePanel>{section.body}</DisclosurePanel>
 *     </DisclosureGroupItem>
 *   )}
 * </DisclosureGroup>
 * ```
 */
export function DisclosureGroup<T>(props: Incoming<DisclosureGroupComponentProps<T>>) {
  const options = fromProps(props as unknown as Incoming<Record<string, unknown>>);
  const state = disclosureGroupState({
    ...(options as DisclosureGroupStateOptions),
    onExpandedChange: (keys) => props.onExpandedChange?.()?.(keys),
  });

  const collection = (): ListCollection<T> =>
    buildCollection(props.items(), props as unknown as ItemAccessors<T>);

  const owner = getOwner();
  if (owner !== null) install(owner, DisclosureGroupContext, () => ({ state }));

  const elementProps = mergeProps(styleProps(props), {
    "data-testid": () => props["data-testid"]?.(),
  });

  const render = props.children as unknown as (scope: unknown, item: T) => Child;

  return (
    <div {...elementProps} ref={mergeRefs(props.ref?.())}>
      <For each={() => [...collection()]}>
        {(node: Node<T>) => {
          const rowOwner = getOwner();
          if (rowOwner !== null) {
            install(rowOwner, DisclosureNodeContext, () => node as Node<unknown>);
          }
          return render(rowOwner, node.value as T);
        }}
      </For>
    </div>
  );
}

export interface DisclosureGroupItemComponentProps extends StyleProps {
  children?: Child;
  isDisabled?: boolean;
}

/**
 * One section of a {@link DisclosureGroup}, sharing the group's state.
 *
 * The same `<DisclosureButton>` and `<DisclosurePanel>` go inside it as go
 * inside a lone `<Disclosure>`: what changes is where "expanded" is kept.
 */
export function DisclosureGroupItem(props: Incoming<DisclosureGroupItemComponentProps>) {
  const panelRef = makeRef<HTMLDivElement>();
  const group = useDisclosureGroup();
  const node = useDisclosureNode();

  const state: DisclosureState = {
    isExpanded: () => group.state.expandedKeys().has(node.key),
    setExpanded: (expanded) => {
      if (expanded === group.state.expandedKeys().has(node.key)) return;
      group.state.toggleKey(node.key);
    },
    expand: () => {
      if (!group.state.expandedKeys().has(node.key)) group.state.toggleKey(node.key);
    },
    collapse: () => {
      if (group.state.expandedKeys().has(node.key)) group.state.toggleKey(node.key);
    },
    toggle: () => group.state.toggleKey(node.key),
  };

  const isDisabled = (): boolean =>
    props.isDisabled?.() === true || group.state.isDisabled() || node.props?.isDisabled === true;

  const { buttonProps, panelProps } = disclosure({ panelRef, isDisabled }, state);

  const value: DisclosureContextValue = { state, buttonProps, panelProps, panelRef };
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;

  return provide(
    owner,
    DisclosureContext,
    () => value,
    () => props.children as unknown,
  ) as never;
}
