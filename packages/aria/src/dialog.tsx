/**
 * Dialogs, modals and popovers.
 *
 * A modal dialog is four separate obligations, and leaving any one out makes
 * the other three pointless:
 *
 * - Focus goes into it when it opens and back where it came from when it
 *   closes, and cannot leave while it is open.
 * - Everything else on the page is hidden from assistive technology, or the
 *   virtual cursor walks straight out of the dialog into content the user
 *   cannot see or reach.
 * - The page behind does not scroll.
 * - Escape closes it, and an interaction outside closes it if it is
 *   dismissable — the TOP one only, so a menu inside a dialog closes the menu.
 *
 * A popover is the same minus the modality: focus is contained but the rest of
 * the page is still there.
 */

import {
  type Accessor,
  type Child,
  type Incoming,
  effect,
  onCleanup,
  Portal,
  Show,
  signal,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import { focusScope, type FocusScopeOptions } from "./focus.ts";
import type { ElementRef } from "./interactions/press.ts";
import {
  ariaHideOutside,
  modalOverlay,
  overlay,
  portalContainer,
  providePortalTarget,
  usePortalTarget,
  overlayPosition,
  overlayTrigger,
  overlayTriggerState,
  preventScroll,
  type AnchorRect,
  type OverlayOptions,
  type OverlayTriggerState,
  type Placement,
} from "./overlays.ts";
import { presence } from "./presence.ts";
import {
  access,
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

export interface DialogOptions {
  /** @default "dialog" */
  role?: MaybeAccessor<"dialog" | "alertdialog" | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  "aria-describedby"?: MaybeAccessor<string | undefined>;
}

export interface DialogResult {
  dialogProps: DOMProps;
  /** For the heading that names the dialog. */
  titleProps: DOMProps;
  /** For the element that describes it. */
  descriptionProps: DOMProps;
  /** The same id, for a component that builds its own props. */
  descriptionId: Accessor<string>;
  /**
   * Whether a description is on screen, which is what makes the dialog point
   * at one.
   *
   * A dialog that names an `aria-describedby` no element carries is announced
   * with nothing where the description should be, so the attribute appears
   * only once something has registered and goes again when it leaves.
   */
  readonly describe: (has: boolean) => void;
}

/**
 * A dialog's own props.
 *
 * `tabIndex={-1}` is not decoration: when a dialog holds nothing focusable,
 * focus has to land on the dialog itself or it falls to the body, outside the
 * focus scope that is supposed to be containing it.
 */
export function dialog(options: DialogOptions = {}): DialogResult {
  const titleId = id();
  const descriptionId = id();
  // A count and not a flag: two descriptions is a mistake, but one leaving
  // while the other stays must not take the attribute with it.
  const described = signal(0);
  const labelled = (): string | undefined => access(options["aria-labelledby"]) ?? titleId();

  return {
    titleProps: { id: titleId },
    descriptionProps: { id: descriptionId },
    descriptionId,
    describe: (has) => described.set(described() + (has ? 1 : -1)),
    dialogProps: mergeProps(filterDOMProps(options, { labelable: true }), {
      role: () => access(options.role) ?? "dialog",
      tabIndex: -1,
      "aria-label": () => access(options["aria-label"]),
      "aria-labelledby": () =>
        access(options["aria-label"]) === undefined ? labelled() : undefined,
      // Only the fallback. `filterDOMProps` already forwarded the caller's
      // own, and `mergeProps` COMBINES this attribute rather than replacing
      // it, so returning it here again wrote it twice.
      "aria-describedby": () =>
        access(options["aria-describedby"]) === undefined && described() > 0
          ? descriptionId()
          : undefined,
    }),
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface DialogComponentProps extends StyleProps {
  children?: Child;
  /** @default "dialog" */
  role?: "dialog" | "alertdialog";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLElement>;
}

/**
 * The dialog itself, without any of the overlay behaviour.
 *
 * Use it inside {@link Modal} or {@link Popover}, which supply the focus
 * scope, the dismissal and the modality.
 *
 * ```tsx
 * <Dialog>
 *   <Heading slot="title">Delete?</Heading>
 *   <Button onPress={close}>Cancel</Button>
 * </Dialog>
 * ```
 */
export function Dialog(props: Incoming<DialogComponentProps>) {
  const domRef = makeRef<HTMLElement>();
  const options = fromProps(props);
  const { dialogProps, titleProps, descriptionId, describe } = dialog(options);

  provideDialog({ titleProps, descriptionId, describe });

  const elementProps = mergeProps(
    dialogProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <section {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
      {props.children}
    </section>
  );
}

export interface HeadingComponentProps extends StyleProps {
  children?: Child;
  /** `title` names the enclosing dialog. */
  slot?: "title";
  /** @default 3 */
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * A heading. With `slot="title"` it becomes the enclosing dialog's name.
 *
 * The level is a real `<h1>`–`<h6>`, not `role="heading" aria-level`, because
 * the platform's own headings are what a screen reader's heading list is built
 * from.
 */
export function Heading(props: Incoming<HeadingComponentProps>) {
  const title = useDialogTitle();

  const elementProps = mergeProps(
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      // The title names the dialog only when it says it is the title.
      id: () =>
        props.slot?.() === "title"
          ? access(title?.id as MaybeAccessor<string | undefined>)
          : props.id?.(),
      "aria-level": () => props.level?.() ?? 3,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return <h3 {...elementProps}>{props.children}</h3>;
}

export interface ModalComponentProps extends StyleProps, OverlayOptions {
  children?: Child;
  isOpen?: boolean;
  defaultOpen?: boolean;
  /** @default true */
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
  /**
   * The class for the UNDERLAY — the element covering the page behind the
   * dialog.
   *
   * `class` styles the dialog. The underlay is a second element with a second
   * job, and a design system has to be able to dim the page: without this it
   * could only be reached by a global rule on `[data-barq-underlay]`, which
   * every modal on the page would then share.
   */
  underlayClass?: string;
  underlaySlot?: string;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A modal: contained focus, an inert page behind it, no scrolling, and Escape.
 *
 * Renders nothing while closed. There is no hidden-but-present state, because
 * a dialog that exists in the DOM while closed is a dialog a screen reader can
 * still find.
 */
export function Modal(props: Incoming<ModalComponentProps>) {
  const options = fromProps(props);
  const state = overlayTriggerState(options);

  return (
    <ModalContents
      isOpen={state.isOpen()}
      onClose={state.close}
      isDismissable={props.isDismissable?.() !== false}
      isKeyboardDismissDisabled={props.isKeyboardDismissDisabled?.() === true}
      underlayClass={props.underlayClass?.()}
      underlaySlot={props.underlaySlot?.()}
      class={props.class?.() ?? props.className?.()}
      style={props.style?.()}
      // The global attributes, the global events and every `data-*` the caller
      // gave THIS component, forwarded to the element the caller can see. They
      // cannot be spread on `<ModalContents>` itself: it is a private component
      // with its own props, and a `data-slot` landing there would be a prop it
      // does not have rather than an attribute on the dialog.
      domProps={filterDOMProps(options, { global: true })}
    >
      {props.children}
    </ModalContents>
  );
}

interface ContentsProps extends StyleProps {
  isOpen: boolean;
  onClose: () => void;
  isDismissable: boolean;
  isKeyboardDismissDisabled: boolean;
  underlayClass?: string;
  underlaySlot?: string;
  /** What `Modal` filtered out of its own props for the dialog's element. */
  domProps?: DOMProps;
  children?: Child;
}

/**
 * The modal's body, mounted while it is open and for as long as it takes to
 * leave.
 *
 * A dialog that stays in the DOM while CLOSED is a dialog a screen reader can
 * still find, so there is no hidden-but-present state to style. `presence`
 * holds it only while the stylesheet is still drawing it, marked `data-closed`
 * — and when nothing is animating, that is no time at all.
 */
function ModalContents(props: Incoming<ContentsProps>) {
  // `<Show>`, not a bare `{() => …}`: a Cell at a component's root travels in
  // the array its caller places, and an array hole is ONE effect — so the
  // condition would become a dependency of whatever hole holds this component,
  // and opening the modal would rebuild every sibling around it.
  const target = usePortalTarget();
  // The ref lives HERE and the focus scope does not. The scope has to be
  // created with the content it contains, because its disposal is what restores
  // focus; the ref only has to outlive the content so the exit can be measured.
  const domRef = makeRef<HTMLDivElement>();
  const gate = presence({ isOpen: props.isOpen, ref: domRef });

  return (
    <Show when={gate.isPresent()}>
      <Portal mount={portalContainer(target)}>
        <ModalBody
          domRef={domRef}
          isExiting={gate.isExiting()}
          onClose={props.onClose()}
          isDismissable={props.isDismissable()}
          isKeyboardDismissDisabled={props.isKeyboardDismissDisabled()}
          underlayClass={props.underlayClass?.()}
          underlaySlot={props.underlaySlot?.()}
          domProps={props.domProps?.()}
          class={props.class?.()}
          style={props.style?.()}
        >
          {props.children}
        </ModalBody>
      </Portal>
    </Show>
  );
}

interface BodyProps extends StyleProps {
  domRef: ReturnType<typeof makeRef<HTMLDivElement>>;
  isExiting: boolean;
  onClose: () => void;
  isDismissable: boolean;
  isKeyboardDismissDisabled: boolean;
  underlayClass?: string;
  underlaySlot?: string;
  domProps?: DOMProps;
  children?: Child;
}

/**
 * Inside the `<Show>`, and that is the whole reason it is a component.
 *
 * The focus scope has to be created WITH the content it contains: closing the
 * modal disposes this subtree, and disposal is what restores focus to whatever
 * opened it. Called one level up — in `ModalContents`, beside the `<Show>` —
 * the scope outlives every open and close, so nothing was ever disposed and
 * focus was left on `<body>`. No test saw it: happy-dom leaves `activeElement`
 * on an element after it is removed, so the assertion passed for the wrong
 * reason.
 */
function ModalBody(props: Incoming<BodyProps>) {
  const domRef = props.domRef();
  const scope = focusScope({ contain: true, restoreFocus: true, autoFocus: true });

  const state: OverlayTriggerState = {
    isOpen: () => true,
    setOpen: (open) => {
      if (!open) props.onClose()();
    },
    open: () => {},
    close: () => props.onClose()(),
    toggle: () => props.onClose()(),
  };

  const { overlayProps, underlayProps, modalProps } = modalOverlay(
    {
      isDismissable: () => props.isDismissable(),
      isKeyboardDismissDisabled: () => props.isKeyboardDismissDisabled(),
    },
    state,
    domRef,
  );

  const elementProps = mergeProps(
    overlayProps,
    modalProps,
    props.domProps?.() ?? null,
    styleProps(props),
  );

  return (
    <div
      {...underlayProps}
      data-barq-underlay
      // A `data-slot` like every other element in this package, and the reason
      // is a consumer's stylesheet: `[data-barq-underlay]` is one global rule
      // and cannot tell a dialog's backdrop from a sheet's. shadcn names them
      // separately (`cn-dialog-overlay`, `cn-sheet-overlay`) and so can anyone
      // styling these.
      data-slot={props.underlaySlot?.()}
      data-closed={props.isExiting() ? "" : undefined}
      class={props.underlayClass?.()}
    >
      <span hidden ref={scope.startRef} />
      <div {...elementProps} data-closed={props.isExiting() ? "" : undefined} ref={domRef.set}>
        {props.children}
      </div>
      <span hidden ref={scope.endRef} />
    </div>
  );
}

export interface PopoverComponentProps extends StyleProps {
  children?: Child;
  /** The element the popover is anchored to. */
  triggerRef: ElementRef;
  /**
   * A box to place against instead of the trigger's own, in client
   * coordinates. A context menu passes the point the pointer was at.
   */
  triggerRect?: AnchorRect | null;
  isOpen?: boolean;
  defaultOpen?: boolean;
  /** @default "bottom" */
  placement?: Placement;
  /** @default 8 */
  offset?: number;
  crossOffset?: number;
  shouldFlip?: boolean;
  containerPadding?: number;
  /** @default true */
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
  /** Hide the rest of the page from assistive technology. @default false */
  isModal?: boolean;
  /**
   * Opened from inside another popover, so it joins that one's group.
   *
   * A submenu sets it. Without it a popover portals to the body and counts as
   * a separate overlay, and a press inside it closes the one it came from.
   */
  isNested?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A popover anchored to a trigger: positioned, dismissable, focus-contained.
 *
 * Not modal by default. A popover the user can still reach the page behind is
 * the right default for a menu or a colour picker; a date picker that must not
 * be escaped sets `isModal`.
 */
export function Popover(props: Incoming<PopoverComponentProps>) {
  const domRef = makeRef<HTMLDivElement>();
  const options = fromProps(props);
  const state = overlayTriggerState(options);

  const position = overlayPosition({
    targetRef: () => access(props.triggerRef()),
    targetRect: () => props.triggerRect?.() ?? null,
    overlayRef: domRef,
    placement: () => props.placement?.() ?? "bottom",
    offset: () => props.offset?.() ?? 8,
    crossOffset: () => props.crossOffset?.(),
    shouldFlip: () => props.shouldFlip?.(),
    containerPadding: () => props.containerPadding?.(),
    isOpen: state.isOpen,
    onClose: state.close,
  });

  // A popover opened from INSIDE another one — a submenu — is portalled into
  // the outer popover's own container rather than into the body, so that the
  // two are one overlay as far as an outside press and `aria-hidden` are
  // concerned. Pressing a submenu item is not a press outside its menu.
  const group = usePopoverGroup();
  const nested = group !== null && props.isNested?.() === true;
  const groupRef = makeRef<HTMLDivElement>();

  const { overlayProps } = overlay(
    {
      isOpen: state.isOpen,
      onClose: state.close,
      isDismissable: () => props.isDismissable?.() !== false,
      isKeyboardDismissDisabled: () => props.isKeyboardDismissDisabled?.() === true,
      groupRef: nested ? group : groupRef,
    },
    domRef,
  );

  preventScroll({ isDisabled: () => !state.isOpen() || props.isModal?.() !== true });

  effect(() => {
    if (!state.isOpen() || props.isModal?.() !== true) return undefined;
    const element = (nested ? access(group) : groupRef()) as Element | null;
    if (element === null) return undefined;
    return ariaHideOutside([element]);
  });

  const elementProps = mergeProps(
    overlayProps,
    position.overlayProps,
    filterDOMProps(options, { global: true }),
    styleProps(props),
    {
      "data-placement": position.placement,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  const target = usePortalTarget();
  const mount = (): Element | null =>
    nested
      ? ((access(group) as Element | null) ?? portalContainer(target))
      : portalContainer(target);

  const gate = presence({ isOpen: state.isOpen, ref: domRef });

  return (
    <Show when={gate.isPresent()}>
      <Portal mount={mount()}>
        {/* `display: contents` so the container lays nothing out. It exists to
            be a PLACE: what a nested popover portals into, and what
            `aria-hidden` and outside-press detection treat as the whole
            overlay. A nested popover passes the ROOT's container down rather
            than its own, so a submenu three deep is still one group. */}
        <div ref={groupRef.set} style={{ display: "contents" }}>
          <PopoverGroupProvider value={nested && group !== null ? group : groupRef}>
            <PopoverBody elementProps={elementProps} domRef={domRef} isExiting={gate.isExiting()}>
              {props.children}
            </PopoverBody>
          </PopoverGroupProvider>
        </div>
      </Portal>
    </Show>
  );
}

interface PopoverBodyProps {
  elementProps: DOMProps;
  domRef: ReturnType<typeof makeRef<HTMLDivElement>>;
  isExiting: boolean;
  children?: Child;
}

/**
 * Inside the `<Show>`, for the same reason `ModalBody` is.
 *
 * The focus scope has to be created WITH the content it contains: closing the
 * popover disposes this subtree, and disposal is what restores focus to the
 * trigger. Called in `Popover`'s own body the scope outlives every open and
 * close, so nothing is ever disposed and focus is left on `<body>`.
 */
function PopoverBody(props: Incoming<PopoverBodyProps>) {
  const scope = focusScope({ contain: true, restoreFocus: true, autoFocus: true });
  const domRef = props.domRef();

  return (
    <>
      <span hidden ref={scope.startRef} />
      <div
        {...props.elementProps()}
        data-closed={props.isExiting() ? "" : undefined}
        ref={domRef.set}
      >
        {props.children}
      </div>
      <span hidden ref={scope.endRef} />
    </>
  );
}

export interface DialogTriggerComponentProps {
  children?: Child;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A trigger and the overlay it opens, sharing one piece of state.
 *
 * ```tsx
 * const state = useDialogTrigger();
 * <Button onPress={state.toggle}>Open</Button>
 * <Modal isOpen={state.isOpen()} onOpenChange={state.setOpen}>…</Modal>
 * ```
 */
export function DialogTrigger(props: Incoming<DialogTriggerComponentProps>) {
  const options = fromProps(props);
  const state = overlayTriggerState(options);
  const { triggerProps, overlayProps } = overlayTrigger({ type: "dialog" }, state);

  return provideDialogTrigger({ state, triggerProps, overlayProps }, () => props.children);
}

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

import { context, getContext, getOwner, install, provide } from "@barqjs/core";

/**
 * The container a group of popovers is portalled into.
 *
 * A ROOT popover renders one and offers it here; a nested one — a submenu —
 * portals into it rather than into the body. That is what keeps the two
 * together for `aria-hidden` and for outside-press detection while still
 * taking the nested one out of its trigger's DOM.
 */
const PopoverGroupContext = context<ElementRef | null>(null);

/** The enclosing popover's container, if this is inside one. */
export function usePopoverGroup(): ElementRef | null {
  return getContext(PopoverGroupContext) ?? null;
}

function PopoverGroupProvider(props: Incoming<{ value: ElementRef; children?: Child }>) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    PopoverGroupContext,
    () => props.value(),
    () => props.children as unknown,
  ) as never;
}

export interface PortalProviderComponentProps {
  /**
   * Where overlays below here are rendered. Returning `null` means the body.
   *
   * A function rather than an element, because the container often does not
   * exist when the provider runs.
   */
  getContainer?: () => Element | null;
  children?: Child;
}

/**
 * Send every overlay below here somewhere other than the body.
 *
 * For an application rendering inside a shadow root, a fullscreen element or a
 * container it styles: an overlay portalled to the body leaves that subtree
 * and loses the styles, the theme and the containing block with it.
 */
export function PortalProvider(props: Incoming<PortalProviderComponentProps>) {
  providePortalTarget(() => props.getContainer?.()?.() ?? null);
  return <>{props.children}</>;
}

interface DialogSlots {
  titleProps: DOMProps;
  descriptionId: Accessor<string>;
  readonly describe: (has: boolean) => void;
}

export interface DialogDescription {
  readonly id: Accessor<string>;
}

const DialogSlotsContext = context<DialogSlots | null>(null);

function provideDialog(slots: DialogSlots): void {
  const owner = getOwner();
  if (owner !== null) install(owner, DialogSlotsContext, () => slots);
}

/** The props the enclosing dialog's title element must carry, if any. */
export function useDialogTitle(): DOMProps | null {
  return getContext(DialogSlotsContext)?.titleProps ?? null;
}

/**
 * The props the enclosing dialog's description must carry, and the
 * registration that makes the dialog point at it.
 *
 * Calling this is what turns `aria-describedby` on, and leaving turns it off
 * again: a design system's `<DialogDescription>` is the only thing that knows
 * a description exists, and without this the paragraph under the title is read
 * only by someone who goes looking for it.
 */
export function useDialogDescription(): DialogDescription | null {
  const slots = getContext(DialogSlotsContext);
  if (slots === null || slots === undefined) return null;
  slots.describe(true);
  onCleanup(() => slots.describe(false));
  return { id: slots.descriptionId };
}

export interface DialogTriggerValue {
  state: OverlayTriggerState;
  triggerProps: DOMProps;
  overlayProps: DOMProps;
}

const DialogTriggerContext = context<DialogTriggerValue | null>(null);

/**
 * `provide`, not `install`: a component gets no scope of its own, so
 * installing on the ambient owner writes where its SIBLINGS read. Two dialog
 * triggers beside each other both run their bodies before either one's
 * children are built, and every child of both then sees the second one.
 */
function provideDialogTrigger(value: DialogTriggerValue, children: () => Child): never {
  const owner = getOwner();
  if (owner === null) return children() as never;
  return provide(
    owner,
    DialogTriggerContext,
    () => value,
    () => children() as unknown,
  ) as never;
}

/** The enclosing {@link DialogTrigger}'s state and props. */
export function useDialogTrigger(): DialogTriggerValue {
  const value = getContext(DialogTriggerContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a DialogTrigger.");
  }
  return value;
}

export type { FocusScopeOptions };
export type DialogState = Accessor<boolean>;
