/**
 * JSX Runtime for Barq
 *
 * Configure in tsconfig.json:
 * {
 *   "compilerOptions": {
 *     "jsx": "react-jsx",
 *     "jsxImportSource": "@barqjs/core"
 *   }
 * }
 *
 * Type patterns follow SolidJS conventions for reactive JSX.
 */

import type * as CSS from "csstype";
import { Fragment } from "./components.ts";
import type { ArrayElement, Child, Component, JSXElement, Props } from "./dom.ts";
import type { Incoming, StrictAccessor } from "./config.ts";

export { Fragment };

export type { Child, Props, JSXElement, JSXElement as Element, ArrayElement };

// ============================================================================
// Helper Types (exported for user convenience, following SolidJS/React patterns)
// ============================================================================

/**
 * Accessor type - a function that returns a value reactively
 */
export type Accessor<T> = () => T;

/**
 * Setter type - a function that updates a signal value
 */
export type Setter<T> = {
  (value: T): void;
  (fn: (prev: T) => T): void;
};

/**
 * FunctionMaybe - value can be static or a reactive accessor
 * This is the core pattern for reactive attributes
 */
export type FunctionMaybe<T> = T | Accessor<T>;

/**
 * MaybeAccessor - alias for FunctionMaybe (SolidJS naming)
 */
export type MaybeAccessor<T> = FunctionMaybe<T>;

/**
 * The four shapes a component declares, as its BODY receives them.
 *
 * Every one of these is `Incoming`, and that is not decoration: a prop that is
 * present is a Cell and is called at the use site, so `P & { children?: Child }`
 * described a shape no barq component has ever been handed. A component
 * annotated with the old definition read `props.title()` and was told `string`
 * is not callable — which was 21 of `kitchen-sink`'s errors, in the demo whose
 * whole subject is these types.
 *
 * The call site is unaffected: `LibraryManagedAttributes` widens back to values.
 */
export type PropsWithChildren<P = Record<string, never>> = Incoming<P & { children?: Child }>;

/**
 * ParentProps - alias for PropsWithChildren (SolidJS naming)
 */
export type ParentProps<P = Record<string, never>> = PropsWithChildren<P>;

/**
 * VoidProps - props for components that don't accept children
 */
export type VoidProps<P = Record<string, never>> = Incoming<P> & { children?: never };

/**
 * FlowProps - props for components that must have children
 */
export type FlowProps<P = Record<string, never>, C = Child> = Incoming<P & { children: C }>;

/**
 * ComponentProps - extract props type from a component
 */
export type ComponentProps<T extends Component<unknown>> = T extends Component<infer P> ? P : never;

/**
 * ValidComponent - union of valid component types
 */
export type ValidComponent = keyof JSX.IntrinsicElements | Component<unknown>;

/**
 * IntrinsicElementProps - get props for an intrinsic element
 */
export type IntrinsicElementProps<K extends keyof JSX.IntrinsicElements> = JSX.IntrinsicElements[K];

/**
 * Ref - ref callback or object type
 */
export type Ref<T> = T | ((el: T) => void) | { current: T | null };

/**
 * RefCallback - just the callback form of ref
 */
export type RefCallback<T> = (el: T) => void;

/**
 * RefObject - just the object form of ref
 */
export type RefObject<T> = { current: T | null };

// JSX namespace for TypeScript
export namespace JSX {
  export type Element = JSXElement;

  /**
   * §3.2: a component takes its SCOPE first — `Comp($scope, props)` — and
   * TypeScript's JSX rule reads a function component's FIRST parameter as its
   * props. Without this hook every construct checked its attributes against
   * `Scope` and reported all of them missing: `<Show when={x}>` read as "`when`
   * does not exist on `IntrinsicAttributes & Scope`".
   *
   * The props are the SECOND parameter. A component the author wrote with no
   * parameters at all — which is most of them, since the compiler is what adds
   * the scope — infers `unknown` there and falls back, because a fallback that
   * accepts no attributes is right for a component that declares none.
   *
   * The FALLBACK arm widens and the `Q` arm does not, and the asymmetry is the
   * whole of it. A component written as `function Card(props)` is a
   * ONE-parameter function, which is assignable to the two-parameter pattern
   * with `Q` inferring `unknown` — so the fallback is the arm every hand-written
   * component takes, and it is the arm that needs `Outgoing`, because a
   * component whose props are annotated honestly (`Incoming`) declares
   * accessors and its call sites write values.
   *
   * The `Q` arm is what `For`, `Show` and `Match` take, and it must stay
   * untouched: their declarations are generic, and a mapped type over an
   * inferred type parameter is not invertible — widening there costs `<For>`
   * the item type its callback infers, which is worse than what it buys.
   */
  export type LibraryManagedAttributes<C, P> = C extends (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scope: any,
    props: infer Q,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => any
    ? unknown extends Q
      ? Outgoing<P>
      : Q
    : Outgoing<P>;

  /**
   * The callee's props, as the CALL SITE is allowed to write them.
   *
   * A component body sees every present prop as a Cell (`Incoming`), so a
   * component annotated honestly declares `Accessor<T>` — and without this,
   * annotating one made every call site of it a type error, because JSX checked
   * the attributes against the callee shape and demanded `title={() => "x"}`
   * where the compiler is what adds the thunk. Widening here is the inverse of
   * `Incoming`, and it is where the widening belongs: `StrictAccessor` already
   * decides, per mode, whether a bare value is allowed.
   *
   * `NonNullable` first, because optionality is carried in the VALUE: an
   * optional prop is `Accessor<T> | undefined`, which does not extend
   * `() => R`, so without it every optional prop fell through unwidened — and
   * the mapped type puts the `?` back on its own.
   *
   * A zero-argument prop is an accessor and is unwrapped. A prop that declares
   * parameters is a SLOT — `<For>`'s `(item, index) => …`, a `ref` callback, an
   * event handler the caller writes inline — and is left exactly as declared,
   * because a slot is called with arguments and unwrapping it would erase the
   * inference the declaration exists for. TypeScript separates the two for
   * free: a function with a required parameter is not assignable to `() => R`.
   */
  type Outgoing<Q> = {
    [K in keyof Q]: NonNullable<Q[K]> extends () => infer R ? StrictAccessor<R> : Q[K];
  };

  // Core utility types (following SolidJS patterns)

  /**
   * Accessor type - a function that returns a value reactively
   */
  // oxlint-disable-next-line no-shadow
  export type Accessor<T> = () => T;

  /**
   * FunctionMaybe - value can be static or a reactive accessor
   * This is the core pattern for reactive attributes
   */
  // oxlint-disable-next-line no-shadow
  export type FunctionMaybe<T> = T | Accessor<T>;

  /**
   * Event handler with proper currentTarget typing
   */
  export type EventHandler<T, E extends Event> = (
    e: E & {
      currentTarget: T;
      target: globalThis.Element;
    },
  ) => void;

  /**
   * Bound event handler - tuple of [handler, data] for passing data without closure
   */
  export interface BoundEventHandler<T, E extends Event> {
    0: (data: unknown, e: E & { currentTarget: T; target: globalThis.Element }) => void;
    1: unknown;
  }

  /**
   * Event handler union - supports both regular and bound handlers
   */
  export type EventHandlerUnion<T, E extends Event> = EventHandler<T, E> | BoundEventHandler<T, E>;

  /**
   * Input event handler with proper target typing for form elements
   */
  export type InputEventHandler<T, E extends Event> = (
    e: E & {
      currentTarget: T;
      target: T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        ? T
        : globalThis.Element;
    },
  ) => void;

  export type InputEventHandlerUnion<T, E extends Event> =
    | InputEventHandler<T, E>
    | BoundEventHandler<T, E>;

  // Intrinsic attributes shared by all elements
  export interface IntrinsicAttributes {
    ref?: ((el: unknown) => void) | { current: unknown };
  }

  export interface IntrinsicElements {
    // HTML elements
    a: HTMLAttributes<HTMLAnchorElement>;
    abbr: HTMLAttributes<HTMLElement>;
    address: HTMLAttributes<HTMLElement>;
    area: HTMLAttributes<HTMLAreaElement>;
    article: HTMLAttributes<HTMLElement>;
    aside: HTMLAttributes<HTMLElement>;
    audio: HTMLAttributes<HTMLAudioElement>;
    b: HTMLAttributes<HTMLElement>;
    base: HTMLAttributes<HTMLBaseElement>;
    bdi: HTMLAttributes<HTMLElement>;
    bdo: HTMLAttributes<HTMLElement>;
    blockquote: HTMLAttributes<HTMLQuoteElement>;
    body: HTMLAttributes<HTMLBodyElement>;
    br: HTMLAttributes<HTMLBRElement>;
    button: HTMLAttributes<HTMLButtonElement>;
    canvas: HTMLAttributes<HTMLCanvasElement>;
    caption: HTMLAttributes<HTMLTableCaptionElement>;
    cite: HTMLAttributes<HTMLElement>;
    code: HTMLAttributes<HTMLElement>;
    col: HTMLAttributes<HTMLTableColElement>;
    colgroup: HTMLAttributes<HTMLTableColElement>;
    data: HTMLAttributes<HTMLDataElement>;
    datalist: HTMLAttributes<HTMLDataListElement>;
    dd: HTMLAttributes<HTMLElement>;
    del: HTMLAttributes<HTMLModElement>;
    details: HTMLAttributes<HTMLDetailsElement>;
    dfn: HTMLAttributes<HTMLElement>;
    dialog: HTMLAttributes<HTMLDialogElement>;
    div: HTMLAttributes<HTMLDivElement>;
    dl: HTMLAttributes<HTMLDListElement>;
    dt: HTMLAttributes<HTMLElement>;
    em: HTMLAttributes<HTMLElement>;
    embed: HTMLAttributes<HTMLEmbedElement>;
    fieldset: HTMLAttributes<HTMLFieldSetElement>;
    figcaption: HTMLAttributes<HTMLElement>;
    figure: HTMLAttributes<HTMLElement>;
    footer: HTMLAttributes<HTMLElement>;
    form: FormHTMLAttributes<HTMLFormElement>;
    h1: HTMLAttributes<HTMLHeadingElement>;
    h2: HTMLAttributes<HTMLHeadingElement>;
    h3: HTMLAttributes<HTMLHeadingElement>;
    h4: HTMLAttributes<HTMLHeadingElement>;
    h5: HTMLAttributes<HTMLHeadingElement>;
    h6: HTMLAttributes<HTMLHeadingElement>;
    head: HTMLAttributes<HTMLHeadElement>;
    header: HTMLAttributes<HTMLElement>;
    hgroup: HTMLAttributes<HTMLElement>;
    hr: HTMLAttributes<HTMLHRElement>;
    html: HTMLAttributes<HTMLHtmlElement>;
    i: HTMLAttributes<HTMLElement>;
    iframe: HTMLAttributes<HTMLIFrameElement>;
    img: HTMLAttributes<HTMLImageElement>;
    input: HTMLAttributes<HTMLInputElement>;
    ins: HTMLAttributes<HTMLModElement>;
    kbd: HTMLAttributes<HTMLElement>;
    label: HTMLAttributes<HTMLLabelElement>;
    legend: HTMLAttributes<HTMLLegendElement>;
    li: HTMLAttributes<HTMLLIElement>;
    link: HTMLAttributes<HTMLLinkElement>;
    main: HTMLAttributes<HTMLElement>;
    map: HTMLAttributes<HTMLMapElement>;
    mark: HTMLAttributes<HTMLElement>;
    menu: HTMLAttributes<HTMLMenuElement>;
    meta: HTMLAttributes<HTMLMetaElement>;
    meter: HTMLAttributes<HTMLMeterElement>;
    nav: HTMLAttributes<HTMLElement>;
    noscript: HTMLAttributes<HTMLElement>;
    object: HTMLAttributes<HTMLObjectElement>;
    ol: HTMLAttributes<HTMLOListElement>;
    optgroup: HTMLAttributes<HTMLOptGroupElement>;
    option: HTMLAttributes<HTMLOptionElement>;
    output: HTMLAttributes<HTMLOutputElement>;
    p: HTMLAttributes<HTMLParagraphElement>;
    picture: HTMLAttributes<HTMLPictureElement>;
    pre: HTMLAttributes<HTMLPreElement>;
    progress: HTMLAttributes<HTMLProgressElement>;
    q: HTMLAttributes<HTMLQuoteElement>;
    rp: HTMLAttributes<HTMLElement>;
    rt: HTMLAttributes<HTMLElement>;
    ruby: HTMLAttributes<HTMLElement>;
    s: HTMLAttributes<HTMLElement>;
    samp: HTMLAttributes<HTMLElement>;
    script: HTMLAttributes<HTMLScriptElement>;
    section: HTMLAttributes<HTMLElement>;
    select: HTMLAttributes<HTMLSelectElement>;
    slot: HTMLAttributes<HTMLSlotElement>;
    small: HTMLAttributes<HTMLElement>;
    source: HTMLAttributes<HTMLSourceElement>;
    span: HTMLAttributes<HTMLSpanElement>;
    strong: HTMLAttributes<HTMLElement>;
    style: HTMLAttributes<HTMLStyleElement>;
    sub: HTMLAttributes<HTMLElement>;
    summary: HTMLAttributes<HTMLElement>;
    sup: HTMLAttributes<HTMLElement>;
    table: HTMLAttributes<HTMLTableElement>;
    tbody: HTMLAttributes<HTMLTableSectionElement>;
    td: HTMLAttributes<HTMLTableCellElement>;
    template: HTMLAttributes<HTMLTemplateElement>;
    textarea: HTMLAttributes<HTMLTextAreaElement>;
    tfoot: HTMLAttributes<HTMLTableSectionElement>;
    th: HTMLAttributes<HTMLTableCellElement>;
    thead: HTMLAttributes<HTMLTableSectionElement>;
    time: HTMLAttributes<HTMLTimeElement>;
    title: HTMLAttributes<HTMLTitleElement>;
    tr: HTMLAttributes<HTMLTableRowElement>;
    track: HTMLAttributes<HTMLTrackElement>;
    u: HTMLAttributes<HTMLElement>;
    ul: HTMLAttributes<HTMLUListElement>;
    var: HTMLAttributes<HTMLElement>;
    video: HTMLAttributes<HTMLVideoElement>;
    wbr: HTMLAttributes<HTMLElement>;

    // SVG elements
    svg: SVGAttributes<SVGSVGElement>;
    path: SVGAttributes<SVGPathElement>;
    circle: SVGAttributes<SVGCircleElement>;
    rect: SVGAttributes<SVGRectElement>;
    line: SVGAttributes<SVGLineElement>;
    polyline: SVGAttributes<SVGPolylineElement>;
    polygon: SVGAttributes<SVGPolygonElement>;
    ellipse: SVGAttributes<SVGEllipseElement>;
    text: SVGAttributes<SVGTextElement>;
    tspan: SVGAttributes<SVGTSpanElement>;
    g: SVGAttributes<SVGGElement>;
    defs: SVGAttributes<SVGDefsElement>;
    use: SVGAttributes<SVGUseElement>;
    symbol: SVGAttributes<SVGSymbolElement>;
    clipPath: SVGAttributes<SVGClipPathElement>;
    mask: SVGAttributes<SVGMaskElement>;
    pattern: SVGAttributes<SVGPatternElement>;
    linearGradient: SVGAttributes<SVGLinearGradientElement>;
    radialGradient: SVGAttributes<SVGRadialGradientElement>;
    stop: SVGAttributes<SVGStopElement>;
    filter: SVGAttributes<SVGFilterElement>;
    foreignObject: SVGAttributes<SVGForeignObjectElement>;
    image: SVGAttributes<SVGImageElement>;
    animate: SVGAttributes<SVGAnimateElement>;
    animateMotion: SVGAttributes<SVGAnimateMotionElement>;
    animateTransform: SVGAttributes<SVGAnimateTransformElement>;
  }

  export interface ElementChildrenAttribute {
    children: unknown;
  }

  /**
   * CSS style properties using csstype for comprehensive type coverage.
   * Supports CSS custom properties (variables) with `--` prefix.
   * All properties can be reactive (FunctionMaybe).
   */
  type CSSProperties = {
    [K in keyof CSS.Properties]?: FunctionMaybe<CSS.Properties[K]>;
  } & {
    [key: `--${string}`]: FunctionMaybe<string | number>;
  };

  // Event handlers - CamelCase (React-style)
  interface DOMEventHandlers<T> {
    // Mouse events
    onClick?: EventHandlerUnion<T, MouseEvent>;
    onDblClick?: EventHandlerUnion<T, MouseEvent>;
    onMouseDown?: EventHandlerUnion<T, MouseEvent>;
    onMouseUp?: EventHandlerUnion<T, MouseEvent>;
    onMouseEnter?: EventHandlerUnion<T, MouseEvent>;
    onMouseLeave?: EventHandlerUnion<T, MouseEvent>;
    onMouseMove?: EventHandlerUnion<T, MouseEvent>;
    onMouseOver?: EventHandlerUnion<T, MouseEvent>;
    onMouseOut?: EventHandlerUnion<T, MouseEvent>;
    onContextMenu?: EventHandlerUnion<T, MouseEvent>;

    // Keyboard events
    onKeyDown?: EventHandlerUnion<T, KeyboardEvent>;
    onKeyUp?: EventHandlerUnion<T, KeyboardEvent>;
    onKeyPress?: EventHandlerUnion<T, KeyboardEvent>;

    // Focus events
    onFocus?: EventHandlerUnion<T, FocusEvent>;
    onBlur?: EventHandlerUnion<T, FocusEvent>;
    onFocusIn?: EventHandlerUnion<T, FocusEvent>;
    onFocusOut?: EventHandlerUnion<T, FocusEvent>;

    // Form events
    onInput?: InputEventHandlerUnion<T, InputEvent>;
    onChange?: InputEventHandlerUnion<T, Event>;
    onSubmit?: EventHandlerUnion<T, SubmitEvent>;
    onReset?: EventHandlerUnion<T, Event>;
    onInvalid?: EventHandlerUnion<T, Event>;

    // Clipboard events
    onCopy?: EventHandlerUnion<T, ClipboardEvent>;
    onCut?: EventHandlerUnion<T, ClipboardEvent>;
    onPaste?: EventHandlerUnion<T, ClipboardEvent>;

    // Drag events
    onDragStart?: EventHandlerUnion<T, DragEvent>;
    onDrag?: EventHandlerUnion<T, DragEvent>;
    onDragEnd?: EventHandlerUnion<T, DragEvent>;
    onDragEnter?: EventHandlerUnion<T, DragEvent>;
    onDragLeave?: EventHandlerUnion<T, DragEvent>;
    onDragOver?: EventHandlerUnion<T, DragEvent>;
    onDrop?: EventHandlerUnion<T, DragEvent>;

    // Touch events
    onTouchStart?: EventHandlerUnion<T, TouchEvent>;
    onTouchMove?: EventHandlerUnion<T, TouchEvent>;
    onTouchEnd?: EventHandlerUnion<T, TouchEvent>;
    onTouchCancel?: EventHandlerUnion<T, TouchEvent>;

    // Pointer events
    onPointerDown?: EventHandlerUnion<T, PointerEvent>;
    onPointerUp?: EventHandlerUnion<T, PointerEvent>;
    onPointerMove?: EventHandlerUnion<T, PointerEvent>;
    onPointerEnter?: EventHandlerUnion<T, PointerEvent>;
    onPointerLeave?: EventHandlerUnion<T, PointerEvent>;
    onPointerOver?: EventHandlerUnion<T, PointerEvent>;
    onPointerOut?: EventHandlerUnion<T, PointerEvent>;
    onPointerCancel?: EventHandlerUnion<T, PointerEvent>;
    onGotPointerCapture?: EventHandlerUnion<T, PointerEvent>;
    onLostPointerCapture?: EventHandlerUnion<T, PointerEvent>;

    // Scroll/Wheel events
    onScroll?: EventHandlerUnion<T, Event>;
    onScrollEnd?: EventHandlerUnion<T, Event>;
    onWheel?: EventHandlerUnion<T, WheelEvent>;

    // Animation events
    onAnimationStart?: EventHandlerUnion<T, AnimationEvent>;
    onAnimationEnd?: EventHandlerUnion<T, AnimationEvent>;
    onAnimationIteration?: EventHandlerUnion<T, AnimationEvent>;
    onAnimationCancel?: EventHandlerUnion<T, AnimationEvent>;

    // Transition events
    onTransitionStart?: EventHandlerUnion<T, TransitionEvent>;
    onTransitionEnd?: EventHandlerUnion<T, TransitionEvent>;
    onTransitionRun?: EventHandlerUnion<T, TransitionEvent>;
    onTransitionCancel?: EventHandlerUnion<T, TransitionEvent>;

    // Media events
    onLoad?: EventHandlerUnion<T, Event>;
    onError?: EventHandlerUnion<T, ErrorEvent>;
    onAbort?: EventHandlerUnion<T, UIEvent>;
    onCanPlay?: EventHandlerUnion<T, Event>;
    onCanPlayThrough?: EventHandlerUnion<T, Event>;
    onDurationChange?: EventHandlerUnion<T, Event>;
    onEmptied?: EventHandlerUnion<T, Event>;
    onEnded?: EventHandlerUnion<T, Event>;
    onLoadedData?: EventHandlerUnion<T, Event>;
    onLoadedMetadata?: EventHandlerUnion<T, Event>;
    onLoadStart?: EventHandlerUnion<T, Event>;
    onPause?: EventHandlerUnion<T, Event>;
    onPlay?: EventHandlerUnion<T, Event>;
    onPlaying?: EventHandlerUnion<T, Event>;
    onProgress?: EventHandlerUnion<T, ProgressEvent>;
    onRateChange?: EventHandlerUnion<T, Event>;
    onSeeked?: EventHandlerUnion<T, Event>;
    onSeeking?: EventHandlerUnion<T, Event>;
    onStalled?: EventHandlerUnion<T, Event>;
    onSuspend?: EventHandlerUnion<T, Event>;
    onTimeUpdate?: EventHandlerUnion<T, Event>;
    onVolumeChange?: EventHandlerUnion<T, Event>;
    onWaiting?: EventHandlerUnion<T, Event>;

    // Other events
    onToggle?: EventHandlerUnion<T, Event>;
    onClose?: EventHandlerUnion<T, Event>;
    onSelect?: EventHandlerUnion<T, Event>;
    onResize?: EventHandlerUnion<T, UIEvent>;
  }

  // Event handlers - lowercase (DOM-style, also supported)
  interface DOMEventHandlersLowerCase<T> {
    onclick?: EventHandlerUnion<T, MouseEvent>;
    ondblclick?: EventHandlerUnion<T, MouseEvent>;
    onmousedown?: EventHandlerUnion<T, MouseEvent>;
    onmouseup?: EventHandlerUnion<T, MouseEvent>;
    onmouseenter?: EventHandlerUnion<T, MouseEvent>;
    onmouseleave?: EventHandlerUnion<T, MouseEvent>;
    onmousemove?: EventHandlerUnion<T, MouseEvent>;
    onmouseover?: EventHandlerUnion<T, MouseEvent>;
    onmouseout?: EventHandlerUnion<T, MouseEvent>;
    oncontextmenu?: EventHandlerUnion<T, MouseEvent>;
    onkeydown?: EventHandlerUnion<T, KeyboardEvent>;
    onkeyup?: EventHandlerUnion<T, KeyboardEvent>;
    onkeypress?: EventHandlerUnion<T, KeyboardEvent>;
    onfocus?: EventHandlerUnion<T, FocusEvent>;
    onblur?: EventHandlerUnion<T, FocusEvent>;
    oninput?: InputEventHandlerUnion<T, InputEvent>;
    onchange?: InputEventHandlerUnion<T, Event>;
    onsubmit?: EventHandlerUnion<T, SubmitEvent>;
    onreset?: EventHandlerUnion<T, Event>;
    oncopy?: EventHandlerUnion<T, ClipboardEvent>;
    oncut?: EventHandlerUnion<T, ClipboardEvent>;
    onpaste?: EventHandlerUnion<T, ClipboardEvent>;
    onscroll?: EventHandlerUnion<T, Event>;
    onwheel?: EventHandlerUnion<T, WheelEvent>;
    onload?: EventHandlerUnion<T, Event>;
    onerror?: EventHandlerUnion<T, ErrorEvent>;
  }

  /**
   * What an `action()` hands back, and the only value shape B8's `action` slot
   * accepts besides a URL. The arguments are the action's own; a `<form>`
   * submission calls it with the `FormData`, so a zero-arity action is legal
   * too.
   */
  export type FormAction = (...args: never[]) => Promise<unknown>;

  /**
   * `<form>` is the one tag whose `action` is decided by the SLOT rather than
   * by the value's shape (B8), so it is the one tag with attributes of its own.
   * The compiler lowers a non-URL `action` to `Op::FormAction` and installs a
   * submit listener owned by the position; `HTMLAttributes` types `action` as a
   * URL, which is what it is on every other element, so without this a `<form
   * action={fn}>` — the surface M10 built — did not typecheck anywhere the
   * fixtures do not reach.
   */
  interface FormHTMLAttributes<T extends HTMLElement> extends Omit<HTMLAttributes<T>, "action"> {
    action?: FunctionMaybe<string> | FormAction;
  }

  // Base HTML attributes
  interface HTMLAttributes<T extends HTMLElement>
    extends DOMEventHandlers<T>, DOMEventHandlersLowerCase<T> {
    // Core attributes - all support reactive accessors
    id?: FunctionMaybe<string>;
    class?: FunctionMaybe<string | string[] | Record<string, boolean | undefined>>;
    className?: FunctionMaybe<string | string[] | Record<string, boolean | undefined>>;
    classList?: Record<string, FunctionMaybe<boolean | undefined>>;
    style?: FunctionMaybe<string | CSSProperties>;
    title?: FunctionMaybe<string>;
    tabIndex?: FunctionMaybe<number>;
    hidden?: FunctionMaybe<boolean>;
    draggable?: FunctionMaybe<boolean | "true" | "false">;
    contentEditable?: FunctionMaybe<boolean | "true" | "false" | "inherit">;
    spellcheck?: FunctionMaybe<boolean>;
    dir?: FunctionMaybe<"ltr" | "rtl" | "auto">;
    lang?: FunctionMaybe<string>;
    slot?: FunctionMaybe<string>;
    translate?: FunctionMaybe<"yes" | "no">;
    inert?: FunctionMaybe<boolean>;
    popover?: FunctionMaybe<"auto" | "manual" | boolean>;

    // Dangerous innerHTML
    dangerouslySetInnerHTML?: { __html: string };
    innerHTML?: FunctionMaybe<string>;
    innerText?: FunctionMaybe<string>;
    textContent?: FunctionMaybe<string>;

    // Data attributes
    [key: `data-${string}`]: FunctionMaybe<string | number | boolean | undefined>;

    // ARIA attributes
    role?: FunctionMaybe<string>;
    [key: `aria-${string}`]: FunctionMaybe<string | number | boolean | undefined>;

    // Ref - callback or object
    ref?: T | ((el: T) => void) | { current: T | null };

    // Children
    children?: Child | Child[];

    // Form attributes - all support reactive accessors
    name?: FunctionMaybe<string>;
    value?: FunctionMaybe<string | number | boolean | string[]>;
    checked?: FunctionMaybe<boolean>;
    disabled?: FunctionMaybe<boolean>;
    readonly?: FunctionMaybe<boolean>;
    readOnly?: FunctionMaybe<boolean>;
    required?: FunctionMaybe<boolean>;
    placeholder?: FunctionMaybe<string>;
    type?: FunctionMaybe<string>;
    min?: FunctionMaybe<string | number>;
    max?: FunctionMaybe<string | number>;
    step?: FunctionMaybe<string | number>;
    pattern?: FunctionMaybe<string>;
    multiple?: FunctionMaybe<boolean>;
    accept?: FunctionMaybe<string>;
    autocomplete?: FunctionMaybe<string>;
    autofocus?: FunctionMaybe<boolean>;
    autoFocus?: FunctionMaybe<boolean>;
    formAction?: FunctionMaybe<string>;
    formMethod?: FunctionMaybe<string>;
    formNoValidate?: FunctionMaybe<boolean>;
    formTarget?: FunctionMaybe<string>;

    // Link/anchor attributes
    href?: FunctionMaybe<string>;
    target?: FunctionMaybe<string>;
    rel?: FunctionMaybe<string>;
    download?: FunctionMaybe<string | boolean>;
    ping?: FunctionMaybe<string>;
    referrerPolicy?: FunctionMaybe<string>;

    // Image attributes
    src?: FunctionMaybe<string>;
    alt?: FunctionMaybe<string>;
    width?: FunctionMaybe<number | string>;
    height?: FunctionMaybe<number | string>;
    loading?: FunctionMaybe<"lazy" | "eager">;
    decoding?: FunctionMaybe<"sync" | "async" | "auto">;
    srcset?: FunctionMaybe<string>;
    sizes?: FunctionMaybe<string>;
    crossOrigin?: FunctionMaybe<"anonymous" | "use-credentials" | "">;
    crossorigin?: FunctionMaybe<"anonymous" | "use-credentials" | "">;
    fetchPriority?: FunctionMaybe<"high" | "low" | "auto">;

    // Form element attributes
    action?: FunctionMaybe<string>;
    method?: FunctionMaybe<string>;
    enctype?: FunctionMaybe<string>;
    novalidate?: FunctionMaybe<boolean>;
    noValidate?: FunctionMaybe<boolean>;
    for?: FunctionMaybe<string>;
    htmlFor?: FunctionMaybe<string>;

    // Table attributes
    colspan?: FunctionMaybe<number>;
    colSpan?: FunctionMaybe<number>;
    rowspan?: FunctionMaybe<number>;
    rowSpan?: FunctionMaybe<number>;
    scope?: FunctionMaybe<string>;

    // Media attributes
    autoplay?: FunctionMaybe<boolean>;
    autoPlay?: FunctionMaybe<boolean>;
    controls?: FunctionMaybe<boolean>;
    loop?: FunctionMaybe<boolean>;
    muted?: FunctionMaybe<boolean>;
    preload?: FunctionMaybe<"none" | "metadata" | "auto" | "">;
    poster?: FunctionMaybe<string>;
    playsInline?: FunctionMaybe<boolean>;
    playsinline?: FunctionMaybe<boolean>;

    // Iframe attributes
    sandbox?: FunctionMaybe<string>;
    allow?: FunctionMaybe<string>;
    allowFullScreen?: FunctionMaybe<boolean>;
    allowfullscreen?: FunctionMaybe<boolean>;

    // Other common attributes
    open?: FunctionMaybe<boolean>;
    selected?: FunctionMaybe<boolean>;
    label?: FunctionMaybe<string>;
    rows?: FunctionMaybe<number>;
    cols?: FunctionMaybe<number>;
    wrap?: FunctionMaybe<"hard" | "soft" | "off">;
    maxLength?: FunctionMaybe<number>;
    maxlength?: FunctionMaybe<number>;
    minLength?: FunctionMaybe<number>;
    minlength?: FunctionMaybe<number>;
    size?: FunctionMaybe<number>;
    form?: FunctionMaybe<string>;
    list?: FunctionMaybe<string>;
    inputMode?: FunctionMaybe<
      "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search"
    >;
    inputmode?: FunctionMaybe<
      "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search"
    >;
    enterKeyHint?: FunctionMaybe<"enter" | "done" | "go" | "next" | "previous" | "search" | "send">;
    enterkeyhint?: FunctionMaybe<"enter" | "done" | "go" | "next" | "previous" | "search" | "send">;

    // Content security
    nonce?: FunctionMaybe<string>;
    integrity?: FunctionMaybe<string>;

    // Accessibility
    accessKey?: FunctionMaybe<string>;
    accesskey?: FunctionMaybe<string>;
  }

  // SVG attributes
  interface SVGAttributes<T extends SVGElement>
    extends DOMEventHandlers<T>, DOMEventHandlersLowerCase<T> {
    // Core SVG attributes
    id?: FunctionMaybe<string>;
    class?: FunctionMaybe<string | string[] | Record<string, boolean | undefined>>;
    className?: FunctionMaybe<string | string[] | Record<string, boolean | undefined>>;
    classList?: Record<string, FunctionMaybe<boolean | undefined>>;
    style?: FunctionMaybe<string | CSSProperties>;
    tabIndex?: FunctionMaybe<number>;

    // Ref and children
    ref?: T | ((el: T) => void) | { current: T | null };
    children?: Child | Child[];

    // SVG-specific attributes
    viewBox?: FunctionMaybe<string>;
    xmlns?: FunctionMaybe<string>;
    "xmlns:xlink"?: FunctionMaybe<string>;
    fill?: FunctionMaybe<string>; // Also used for animation fill mode (freeze, remove)
    stroke?: FunctionMaybe<string>;
    strokeWidth?: FunctionMaybe<number | string>;
    "stroke-width"?: FunctionMaybe<number | string>;
    strokeLinecap?: FunctionMaybe<"butt" | "round" | "square">;
    "stroke-linecap"?: FunctionMaybe<"butt" | "round" | "square">;
    strokeLinejoin?: FunctionMaybe<"miter" | "round" | "bevel">;
    "stroke-linejoin"?: FunctionMaybe<"miter" | "round" | "bevel">;
    strokeDasharray?: FunctionMaybe<string>;
    "stroke-dasharray"?: FunctionMaybe<string>;
    strokeDashoffset?: FunctionMaybe<number | string>;
    "stroke-dashoffset"?: FunctionMaybe<number | string>;
    strokeOpacity?: FunctionMaybe<number | string>;
    "stroke-opacity"?: FunctionMaybe<number | string>;
    fillOpacity?: FunctionMaybe<number | string>;
    "fill-opacity"?: FunctionMaybe<number | string>;
    opacity?: FunctionMaybe<number | string>;
    transform?: FunctionMaybe<string>;
    transformOrigin?: FunctionMaybe<string>;
    "transform-origin"?: FunctionMaybe<string>;

    // Geometry attributes
    cx?: FunctionMaybe<number | string>;
    cy?: FunctionMaybe<number | string>;
    r?: FunctionMaybe<number | string>;
    rx?: FunctionMaybe<number | string>;
    ry?: FunctionMaybe<number | string>;
    x?: FunctionMaybe<number | string>;
    y?: FunctionMaybe<number | string>;
    x1?: FunctionMaybe<number | string>;
    y1?: FunctionMaybe<number | string>;
    x2?: FunctionMaybe<number | string>;
    y2?: FunctionMaybe<number | string>;
    width?: FunctionMaybe<number | string>;
    height?: FunctionMaybe<number | string>;
    d?: FunctionMaybe<string>;
    points?: FunctionMaybe<string>;
    pathLength?: FunctionMaybe<number>;

    // Presentation attributes
    preserveAspectRatio?: FunctionMaybe<string>;
    clipPathUnits?: FunctionMaybe<"userSpaceOnUse" | "objectBoundingBox">;
    maskUnits?: FunctionMaybe<"userSpaceOnUse" | "objectBoundingBox">;
    maskContentUnits?: FunctionMaybe<"userSpaceOnUse" | "objectBoundingBox">;
    patternUnits?: FunctionMaybe<"userSpaceOnUse" | "objectBoundingBox">;
    patternContentUnits?: FunctionMaybe<"userSpaceOnUse" | "objectBoundingBox">;
    gradientUnits?: FunctionMaybe<"userSpaceOnUse" | "objectBoundingBox">;
    gradientTransform?: FunctionMaybe<string>;
    spreadMethod?: FunctionMaybe<"pad" | "reflect" | "repeat">;
    offset?: FunctionMaybe<number | string>;
    stopColor?: FunctionMaybe<string>;
    "stop-color"?: FunctionMaybe<string>;
    stopOpacity?: FunctionMaybe<number | string>;
    "stop-opacity"?: FunctionMaybe<number | string>;

    // Text attributes
    textAnchor?: FunctionMaybe<"start" | "middle" | "end">;
    "text-anchor"?: FunctionMaybe<"start" | "middle" | "end">;
    dominantBaseline?: FunctionMaybe<string>;
    "dominant-baseline"?: FunctionMaybe<string>;
    alignmentBaseline?: FunctionMaybe<string>;
    "alignment-baseline"?: FunctionMaybe<string>;
    fontSize?: FunctionMaybe<string | number>;
    "font-size"?: FunctionMaybe<string | number>;
    fontFamily?: FunctionMaybe<string>;
    "font-family"?: FunctionMaybe<string>;
    fontWeight?: FunctionMaybe<string | number>;
    "font-weight"?: FunctionMaybe<string | number>;
    letterSpacing?: FunctionMaybe<string | number>;
    "letter-spacing"?: FunctionMaybe<string | number>;
    textDecoration?: FunctionMaybe<string>;
    "text-decoration"?: FunctionMaybe<string>;
    dx?: FunctionMaybe<string | number>;
    dy?: FunctionMaybe<string | number>;

    // xlink attributes
    xlinkHref?: FunctionMaybe<string>;
    "xlink:href"?: FunctionMaybe<string>;
    xlinkShow?: FunctionMaybe<string>;
    "xlink:show"?: FunctionMaybe<string>;
    xlinkTitle?: FunctionMaybe<string>;
    "xlink:title"?: FunctionMaybe<string>;

    // Filter attributes
    filter?: FunctionMaybe<string>;
    clipPath?: FunctionMaybe<string>;
    "clip-path"?: FunctionMaybe<string>;
    clipRule?: FunctionMaybe<"nonzero" | "evenodd">;
    "clip-rule"?: FunctionMaybe<"nonzero" | "evenodd">;
    fillRule?: FunctionMaybe<"nonzero" | "evenodd">;
    "fill-rule"?: FunctionMaybe<"nonzero" | "evenodd">;
    mask?: FunctionMaybe<string>;
    markerStart?: FunctionMaybe<string>;
    "marker-start"?: FunctionMaybe<string>;
    markerMid?: FunctionMaybe<string>;
    "marker-mid"?: FunctionMaybe<string>;
    markerEnd?: FunctionMaybe<string>;
    "marker-end"?: FunctionMaybe<string>;

    // Animation attributes
    attributeName?: FunctionMaybe<string>;
    attributeType?: FunctionMaybe<string>;
    begin?: FunctionMaybe<string>;
    dur?: FunctionMaybe<string>;
    end?: FunctionMaybe<string>;
    repeatCount?: FunctionMaybe<number | "indefinite">;
    repeatDur?: FunctionMaybe<string>;
    from?: FunctionMaybe<string>;
    to?: FunctionMaybe<string>;
    by?: FunctionMaybe<string>;
    values?: FunctionMaybe<string>;
    keyTimes?: FunctionMaybe<string>;
    keySplines?: FunctionMaybe<string>;
    calcMode?: FunctionMaybe<"discrete" | "linear" | "paced" | "spline">;
    type?: FunctionMaybe<string>;

    // Visibility
    visibility?: FunctionMaybe<"visible" | "hidden" | "collapse">;
    display?: FunctionMaybe<string>;

    // Misc
    href?: FunctionMaybe<string>;
    result?: FunctionMaybe<string>;
    in?: FunctionMaybe<string>;
    in2?: FunctionMaybe<string>;
    mode?: FunctionMaybe<string>;
  }
}
