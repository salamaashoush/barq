/**
 * JSX Runtime for Barq
 *
 * Configure in tsconfig.json:
 * {
 *   "compilerOptions": {
 *     "jsx": "react-jsx",
 *     "jsxImportSource": "@barqjs/web"
 *   }
 * }
 *
 * Type patterns follow SolidJS conventions for reactive JSX.
 */

import type * as CSS from "csstype";
import { Fragment } from "@barqjs/core";
import type {
  Accessor,
  Bindable,
  CallSite,
  Child,
  FunctionMaybe,
  JSXElement,
  Ref,
  StrictAccessor,
} from "@barqjs/core";
import type { AsDeclared, DeclaredCallSite } from "@barqjs/core/internal";

export { Fragment };

/**
 * ValidComponent - a tag name or any function of one props object
 */
export type ValidComponent = keyof JSX.IntrinsicElements | ((props: never) => unknown);

/**
 * ComponentProps - the props object a component's body receives, or the
 * attributes of an intrinsic element
 */
export type ComponentProps<T extends ValidComponent> = T extends (props: infer P) => unknown
  ? P
  : T extends keyof JSX.IntrinsicElements
    ? JSX.IntrinsicElements[T]
    : never;

/**
 * IntrinsicElementProps - get props for an intrinsic element
 */
export type IntrinsicElementProps<K extends keyof JSX.IntrinsicElements> = JSX.IntrinsicElements[K];

// JSX namespace for TypeScript
export namespace JSX {
  export type Element = JSXElement;

  /**
   * A component takes its SCOPE first — `Comp($scope, props)` — and
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
   * A props type that declares its call site through `CallSite` is checked
   * against that instead. The flow components do, because `<For>` picks its row
   * signature from `keyed` and a type parameter standing alone in a prop is not
   * inferred through `Outgoing`'s conditional. So do the intrinsic elements:
   * TypeScript runs this hook for a tag as well, and their attributes are
   * already what a call site writes.
   */
  export type LibraryManagedAttributes<C, P> =
    DeclaredCallSite<P> extends AsDeclared
      ? P
      : unknown extends DeclaredCallSite<P>
        ? C extends (scope: never, props: infer Q) => unknown
          ? unknown extends Q
            ? Outgoing<P>
            : Q
          : Outgoing<P>
        : DeclaredCallSite<P>;

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
   * A prop declared `never` stays `never`: `VoidProps` forbids children that
   * way, and `never` would otherwise pass the accessor test and widen to
   * anything.
   *
   * A zero-argument prop is an accessor and is unwrapped. A prop that declares
   * parameters is a SLOT — `<For>`'s `(item, index) => …`, a `ref` callback, an
   * event handler the caller writes inline — and is left exactly as declared,
   * because a slot is called with arguments and unwrapping it would erase the
   * inference the declaration exists for. TypeScript separates the two for
   * free: a function with a required parameter is not assignable to `() => R`.
   */
  type Outgoing<Q> = {
    [K in keyof Q]: [NonNullable<Q[K]>] extends [never]
      ? Q[K]
      : NonNullable<Q[K]> extends () => infer R
        ? StrictAccessor<R>
        : OutgoingMember<Q[K]>;
  };

  /**
   * A prop that is an accessor OR a slot, member by member: `children` that is
   * content or a row callback.
   *
   * The value side of the accessor member gives up its own any-arity function
   * for a zero-arity one. `Child` admits `(...args: never[]) => Child`, which
   * every arrow function matches whatever it declares, and beside it the slot
   * member stops being the single signature that types a callback's parameters.
   */
  type OutgoingMember<M> = M extends () => infer R ? OutgoingValue<R> | Accessor<R> : M;

  type OutgoingValue<R> = R extends (...args: never[]) => infer X
    ? never[] extends Parameters<R>
      ? Accessor<X>
      : R
    : R;

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
    /**
     * `unknown`, because TypeScript intersects this with a tag's own attributes
     * as well as a component's. A narrower type here meets an element's `ref`
     * as a second, different callback signature, and a `ref` written inline
     * then has no contextual type for its parameter.
     */
    ref?: unknown;
  }

  export interface IntrinsicElements {
    // HTML elements
    a: AnchorHTMLAttributes<HTMLAnchorElement>;
    abbr: HTMLAttributes<HTMLElement>;
    address: HTMLAttributes<HTMLElement>;
    area: AreaHTMLAttributes<HTMLAreaElement>;
    article: HTMLAttributes<HTMLElement>;
    aside: HTMLAttributes<HTMLElement>;
    audio: AudioHTMLAttributes<HTMLAudioElement>;
    b: HTMLAttributes<HTMLElement>;
    base: BaseHTMLAttributes<HTMLBaseElement>;
    bdi: HTMLAttributes<HTMLElement>;
    bdo: BdoHTMLAttributes<HTMLElement>;
    blockquote: BlockquoteHTMLAttributes<HTMLQuoteElement>;
    body: BodyHTMLAttributes<HTMLBodyElement>;
    br: HTMLAttributes<HTMLBRElement>;
    button: ButtonHTMLAttributes<HTMLButtonElement>;
    canvas: CanvasHTMLAttributes<HTMLCanvasElement>;
    caption: CaptionHTMLAttributes<HTMLTableCaptionElement>;
    cite: HTMLAttributes<HTMLElement>;
    code: HTMLAttributes<HTMLElement>;
    col: ColHTMLAttributes<HTMLTableColElement>;
    colgroup: ColgroupHTMLAttributes<HTMLTableColElement>;
    data: DataHTMLAttributes<HTMLDataElement>;
    datalist: HTMLAttributes<HTMLDataListElement>;
    dd: HTMLAttributes<HTMLElement>;
    del: ModHTMLAttributes<HTMLModElement>;
    details: DetailsHTMLAttributes<HTMLDetailsElement>;
    dfn: HTMLAttributes<HTMLElement>;
    dialog: DialogHTMLAttributes<HTMLDialogElement>;
    div: HTMLAttributes<HTMLDivElement>;
    dl: HTMLAttributes<HTMLDListElement>;
    dt: HTMLAttributes<HTMLElement>;
    em: HTMLAttributes<HTMLElement>;
    embed: EmbedHTMLAttributes<HTMLEmbedElement>;
    fieldset: FieldsetHTMLAttributes<HTMLFieldSetElement>;
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
    html: HtmlHTMLAttributes<HTMLHtmlElement>;
    i: HTMLAttributes<HTMLElement>;
    iframe: IframeHTMLAttributes<HTMLIFrameElement>;
    img: ImgHTMLAttributes<HTMLImageElement>;
    input: InputHTMLAttributes<HTMLInputElement>;
    ins: ModHTMLAttributes<HTMLModElement>;
    kbd: HTMLAttributes<HTMLElement>;
    label: LabelHTMLAttributes<HTMLLabelElement>;
    legend: HTMLAttributes<HTMLLegendElement>;
    li: LiHTMLAttributes<HTMLLIElement>;
    link: LinkHTMLAttributes<HTMLLinkElement>;
    main: HTMLAttributes<HTMLElement>;
    map: MapHTMLAttributes<HTMLMapElement>;
    mark: HTMLAttributes<HTMLElement>;
    menu: MenuHTMLAttributes<HTMLMenuElement>;
    meta: MetaHTMLAttributes<HTMLMetaElement>;
    meter: MeterHTMLAttributes<HTMLMeterElement>;
    nav: HTMLAttributes<HTMLElement>;
    noscript: HTMLAttributes<HTMLElement>;
    object: ObjectHTMLAttributes<HTMLObjectElement>;
    ol: OlHTMLAttributes<HTMLOListElement>;
    optgroup: OptgroupHTMLAttributes<HTMLOptGroupElement>;
    option: OptionHTMLAttributes<HTMLOptionElement>;
    output: OutputHTMLAttributes<HTMLOutputElement>;
    p: HTMLAttributes<HTMLParagraphElement>;
    picture: HTMLAttributes<HTMLPictureElement>;
    pre: HTMLAttributes<HTMLPreElement>;
    progress: ProgressHTMLAttributes<HTMLProgressElement>;
    q: QuoteHTMLAttributes<HTMLQuoteElement>;
    rp: HTMLAttributes<HTMLElement>;
    rt: HTMLAttributes<HTMLElement>;
    ruby: HTMLAttributes<HTMLElement>;
    s: HTMLAttributes<HTMLElement>;
    samp: HTMLAttributes<HTMLElement>;
    script: ScriptHTMLAttributes<HTMLScriptElement>;
    search: HTMLAttributes<HTMLElement>;
    section: HTMLAttributes<HTMLElement>;
    select: SelectHTMLAttributes<HTMLSelectElement>;
    slot: SlotHTMLAttributes<HTMLSlotElement>;
    small: HTMLAttributes<HTMLElement>;
    source: SourceHTMLAttributes<HTMLSourceElement>;
    span: HTMLAttributes<HTMLSpanElement>;
    strong: HTMLAttributes<HTMLElement>;
    style: StyleHTMLAttributes<HTMLStyleElement>;
    sub: HTMLAttributes<HTMLElement>;
    summary: HTMLAttributes<HTMLElement>;
    sup: HTMLAttributes<HTMLElement>;
    table: HTMLAttributes<HTMLTableElement>;
    tbody: HTMLAttributes<HTMLTableSectionElement>;
    td: TdHTMLAttributes<HTMLTableCellElement>;
    template: TemplateHTMLAttributes<HTMLTemplateElement>;
    textarea: TextareaHTMLAttributes<HTMLTextAreaElement>;
    tfoot: HTMLAttributes<HTMLTableSectionElement>;
    th: ThHTMLAttributes<HTMLTableCellElement>;
    thead: HTMLAttributes<HTMLTableSectionElement>;
    time: TimeHTMLAttributes<HTMLTimeElement>;
    title: TitleHTMLAttributes<HTMLTitleElement>;
    tr: HTMLAttributes<HTMLTableRowElement>;
    track: TrackHTMLAttributes<HTMLTrackElement>;
    u: HTMLAttributes<HTMLElement>;
    ul: HTMLAttributes<HTMLUListElement>;
    var: HTMLAttributes<HTMLElement>;
    video: VideoHTMLAttributes<HTMLVideoElement>;
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

    // MathML elements. `annotation-xml` is typed by the custom-element signature below,
    // which its hyphen already matches.
    annotation: MathMLAnnotationAttributes;
    math: MathMLMathAttributes;
    merror: MathMLAttributes<MathMLElement>;
    mfrac: MathMLMfracAttributes;
    mi: MathMLMiAttributes;
    mmultiscripts: MathMLAttributes<MathMLElement>;
    mn: MathMLAttributes<MathMLElement>;
    mo: MathMLMoAttributes;
    mover: MathMLMoverAttributes;
    mpadded: MathMLMpaddedAttributes;
    mphantom: MathMLAttributes<MathMLElement>;
    mprescripts: MathMLAttributes<MathMLElement>;
    mroot: MathMLAttributes<MathMLElement>;
    mrow: MathMLAttributes<MathMLElement>;
    ms: MathMLAttributes<MathMLElement>;
    mspace: MathMLMspaceAttributes;
    msqrt: MathMLAttributes<MathMLElement>;
    mstyle: MathMLAttributes<MathMLElement>;
    msub: MathMLAttributes<MathMLElement>;
    msubsup: MathMLAttributes<MathMLElement>;
    msup: MathMLAttributes<MathMLElement>;
    mtable: MathMLMtableAttributes;
    mtd: MathMLMtdAttributes;
    mtext: MathMLAttributes<MathMLElement>;
    mtr: MathMLMtrAttributes;
    munder: MathMLMunderAttributes;
    munderover: MathMLMunderoverAttributes;
    semantics: MathMLAttributes<MathMLElement>;

    /**
     * A custom element. Its attributes are its own, so beyond the global ones
     * any name is accepted; `prop:` writes a name as a property rather than an
     * attribute.
     */
    [tag: `${string}-${string}`]: CustomElementAttributes;
  }

  export interface ElementChildrenAttribute {
    children: unknown;
  }

  /**
   * CSS style properties using csstype for comprehensive type coverage.
   * Supports CSS custom properties (variables) with `--` prefix.
   * All properties can be reactive (FunctionMaybe).
   *
   * Both spellings, because both have always WORKED: every backend puts a key
   * through `toKebabCase`, which leaves `max-width` alone and turns `maxWidth`
   * into it. Naming only the camelCase half made `style={{ "max-width": … }}`
   * a type error for markup the DOM and the string renderer both accept, and
   * `@barqjs/ui`'s own gallery is written in the half that did not typecheck.
   */
  type CSSProperties = {
    [K in keyof CSS.Properties]?: FunctionMaybe<CSS.Properties[K]>;
  } & {
    [K in keyof CSS.PropertiesHyphen]?: FunctionMaybe<CSS.PropertiesHyphen[K]>;
  } & {
    [key: `--${string}`]: FunctionMaybe<string | number>;
  };

  /** An attribute value: static, or an accessor the binding follows. Absent removes it. */
  type Attr<T> = FunctionMaybe<T | undefined>;

  type BooleanAttribute = boolean | "";
  type EnumeratedPseudoBoolean = "false" | "true";
  type EnumeratedAcceptsEmpty = "" | true;
  /** `aria-*` is written as the words `true` and `false`, so a boolean is a value there. */
  type AriaBoolean = boolean | "false" | "true";

  /**
   * What the `class` channel normalises: a string, a map of name to whether it
   * applies, or a list of either (and of further lists) joined in order with
   * the falsy members dropped.
   */
  export type ClassValue =
    | string
    | false
    | null
    | undefined
    | readonly ClassValue[]
    | Record<string, boolean | null | undefined>;

  interface DOMEventHandlers<T> {
    onAbort?: EventHandlerUnion<T, UIEvent>;
    onAnimationCancel?: EventHandlerUnion<T, AnimationEvent>;
    onAnimationEnd?: EventHandlerUnion<T, AnimationEvent>;
    onAnimationIteration?: EventHandlerUnion<T, AnimationEvent>;
    onAnimationStart?: EventHandlerUnion<T, AnimationEvent>;
    onAuxClick?: EventHandlerUnion<T, PointerEvent>;
    onBeforeCopy?: EventHandlerUnion<T, ClipboardEvent>;
    onBeforeCut?: EventHandlerUnion<T, ClipboardEvent>;
    onBeforeInput?: InputEventHandlerUnion<T, InputEvent>;
    onBeforeMatch?: EventHandlerUnion<T, Event>;
    onBeforePaste?: EventHandlerUnion<T, ClipboardEvent>;
    onBeforeToggle?: EventHandlerUnion<T, ToggleEvent>;
    onBeforeXRSelect?: EventHandlerUnion<T, Event>;
    onBlur?: EventHandlerUnion<T, FocusEvent>;
    onCancel?: EventHandlerUnion<T, Event>;
    onCanPlay?: EventHandlerUnion<T, Event>;
    onCanPlayThrough?: EventHandlerUnion<T, Event>;
    onChange?: InputEventHandlerUnion<T, Event>;
    onClick?: EventHandlerUnion<T, MouseEvent>;
    onClose?: EventHandlerUnion<T, Event>;
    onCommand?: EventHandlerUnion<T, CommandEvent>;
    onCompositionEnd?: EventHandlerUnion<T, CompositionEvent>;
    onCompositionStart?: EventHandlerUnion<T, CompositionEvent>;
    onCompositionUpdate?: EventHandlerUnion<T, CompositionEvent>;
    onContentVisibilityAutoStateChange?: EventHandlerUnion<
      T,
      ContentVisibilityAutoStateChangeEvent
    >;
    onContextLost?: EventHandlerUnion<T, Event>;
    onContextMenu?: EventHandlerUnion<T, PointerEvent>;
    onContextRestored?: EventHandlerUnion<T, Event>;
    onCopy?: EventHandlerUnion<T, ClipboardEvent>;
    onCueChange?: EventHandlerUnion<T, Event>;
    onCut?: EventHandlerUnion<T, ClipboardEvent>;
    onDblClick?: EventHandlerUnion<T, MouseEvent>;
    onDrag?: EventHandlerUnion<T, DragEvent>;
    onDragEnd?: EventHandlerUnion<T, DragEvent>;
    onDragEnter?: EventHandlerUnion<T, DragEvent>;
    onDragExit?: EventHandlerUnion<T, DragEvent>;
    onDragLeave?: EventHandlerUnion<T, DragEvent>;
    onDragOver?: EventHandlerUnion<T, DragEvent>;
    onDragStart?: EventHandlerUnion<T, DragEvent>;
    onDrop?: EventHandlerUnion<T, DragEvent>;
    onDurationChange?: EventHandlerUnion<T, Event>;
    onEmptied?: EventHandlerUnion<T, Event>;
    onEnded?: EventHandlerUnion<T, Event>;
    onError?: EventHandlerUnion<T, ErrorEvent>;
    onFocus?: EventHandlerUnion<T, FocusEvent>;
    onFocusIn?: EventHandlerUnion<T, FocusEvent>;
    onFocusOut?: EventHandlerUnion<T, FocusEvent>;
    onFormData?: EventHandlerUnion<T, FormDataEvent>;
    onFullscreenChange?: EventHandlerUnion<T, Event>;
    onFullscreenError?: EventHandlerUnion<T, Event>;
    onInput?: InputEventHandlerUnion<T, InputEvent>;
    onInvalid?: EventHandlerUnion<T, Event>;
    onKeyDown?: EventHandlerUnion<T, KeyboardEvent>;
    onKeyPress?: EventHandlerUnion<T, KeyboardEvent>;
    onKeyUp?: EventHandlerUnion<T, KeyboardEvent>;
    onLoad?: EventHandlerUnion<T, Event>;
    onLoadedData?: EventHandlerUnion<T, Event>;
    onLoadedMetadata?: EventHandlerUnion<T, Event>;
    onLoadStart?: EventHandlerUnion<T, Event>;
    onMouseDown?: EventHandlerUnion<T, MouseEvent>;
    onMouseEnter?: EventHandlerUnion<T, MouseEvent>;
    onMouseLeave?: EventHandlerUnion<T, MouseEvent>;
    onMouseMove?: EventHandlerUnion<T, MouseEvent>;
    onMouseOut?: EventHandlerUnion<T, MouseEvent>;
    onMouseOver?: EventHandlerUnion<T, MouseEvent>;
    onMouseUp?: EventHandlerUnion<T, MouseEvent>;
    onPaste?: EventHandlerUnion<T, ClipboardEvent>;
    onPause?: EventHandlerUnion<T, Event>;
    onPlay?: EventHandlerUnion<T, Event>;
    onPlaying?: EventHandlerUnion<T, Event>;
    onPointerCancel?: EventHandlerUnion<T, PointerEvent>;
    onPointerDown?: EventHandlerUnion<T, PointerEvent>;
    onPointerEnter?: EventHandlerUnion<T, PointerEvent>;
    onPointerLeave?: EventHandlerUnion<T, PointerEvent>;
    onPointerMove?: EventHandlerUnion<T, PointerEvent>;
    onPointerOut?: EventHandlerUnion<T, PointerEvent>;
    onPointerOver?: EventHandlerUnion<T, PointerEvent>;
    onPointerRawUpdate?: EventHandlerUnion<T, PointerEvent>;
    onPointerUp?: EventHandlerUnion<T, PointerEvent>;
    onProgress?: EventHandlerUnion<T, ProgressEvent>;
    onRateChange?: EventHandlerUnion<T, Event>;
    onReset?: EventHandlerUnion<T, Event>;
    onResize?: EventHandlerUnion<T, UIEvent>;
    onScroll?: EventHandlerUnion<T, Event>;
    onScrollEnd?: EventHandlerUnion<T, Event>;
    onScrollSnapChange?: EventHandlerUnion<T, Event>;
    onScrollSnapChanging?: EventHandlerUnion<T, Event>;
    onSecurityPolicyViolation?: EventHandlerUnion<T, SecurityPolicyViolationEvent>;
    onSeeked?: EventHandlerUnion<T, Event>;
    onSeeking?: EventHandlerUnion<T, Event>;
    onSelect?: EventHandlerUnion<T, Event>;
    onSelectionChange?: EventHandlerUnion<T, Event>;
    onSelectStart?: EventHandlerUnion<T, Event>;
    onSlotChange?: EventHandlerUnion<T, Event>;
    onStalled?: EventHandlerUnion<T, Event>;
    onSubmit?: EventHandlerUnion<T, SubmitEvent>;
    onSuspend?: EventHandlerUnion<T, Event>;
    onTimeUpdate?: EventHandlerUnion<T, Event>;
    onToggle?: EventHandlerUnion<T, ToggleEvent>;
    onTouchCancel?: EventHandlerUnion<T, TouchEvent>;
    onTouchEnd?: EventHandlerUnion<T, TouchEvent>;
    onTouchMove?: EventHandlerUnion<T, TouchEvent>;
    onTouchStart?: EventHandlerUnion<T, TouchEvent>;
    onTransitionCancel?: EventHandlerUnion<T, TransitionEvent>;
    onTransitionEnd?: EventHandlerUnion<T, TransitionEvent>;
    onTransitionRun?: EventHandlerUnion<T, TransitionEvent>;
    onTransitionStart?: EventHandlerUnion<T, TransitionEvent>;
    onVolumeChange?: EventHandlerUnion<T, Event>;
    onWaiting?: EventHandlerUnion<T, Event>;
    onWheel?: EventHandlerUnion<T, WheelEvent>;
  }

  interface WindowEventHandlers<T> {
    onAfterPrint?: EventHandlerUnion<T, Event>;
    onBeforePrint?: EventHandlerUnion<T, Event>;
    onBeforeUnload?: EventHandlerUnion<T, BeforeUnloadEvent>;
    onDeviceMotion?: EventHandlerUnion<T, DeviceMotionEvent>;
    onDeviceOrientation?: EventHandlerUnion<T, DeviceOrientationEvent>;
    onDeviceOrientationAbsolute?: EventHandlerUnion<T, DeviceOrientationEvent>;
    onGamepadConnected?: EventHandlerUnion<T, GamepadEvent>;
    onGamepadDisconnected?: EventHandlerUnion<T, GamepadEvent>;
    onHashchange?: EventHandlerUnion<T, HashChangeEvent>;
    onLanguageChange?: EventHandlerUnion<T, Event>;
    onMessage?: EventHandlerUnion<T, MessageEvent>;
    onMessageError?: EventHandlerUnion<T, MessageEvent>;
    onOffline?: EventHandlerUnion<T, Event>;
    onOnline?: EventHandlerUnion<T, Event>;
    /** @deprecated */
    onOrientationChange?: EventHandlerUnion<T, Event>;
    onPageHide?: EventHandlerUnion<T, PageTransitionEvent>;
    onPageReveal?: EventHandlerUnion<T, PageRevealEvent>;
    onPageShow?: EventHandlerUnion<T, PageTransitionEvent>;
    onPageSwap?: EventHandlerUnion<T, PageSwapEvent>;
    onPopstate?: EventHandlerUnion<T, PopStateEvent>;
    onRejectionHandled?: EventHandlerUnion<T, PromiseRejectionEvent>;
    onStorage?: EventHandlerUnion<T, StorageEvent>;
    onUnhandledRejection?: EventHandlerUnion<T, PromiseRejectionEvent>;
    onUnload?: EventHandlerUnion<T, Event>;
  }

  interface DOMEventHandlersLowerCase<T> {
    onabort?: EventHandlerUnion<T, UIEvent>;
    onanimationcancel?: EventHandlerUnion<T, AnimationEvent>;
    onanimationend?: EventHandlerUnion<T, AnimationEvent>;
    onanimationiteration?: EventHandlerUnion<T, AnimationEvent>;
    onanimationstart?: EventHandlerUnion<T, AnimationEvent>;
    onauxclick?: EventHandlerUnion<T, PointerEvent>;
    onbeforecopy?: EventHandlerUnion<T, ClipboardEvent>;
    onbeforecut?: EventHandlerUnion<T, ClipboardEvent>;
    onbeforeinput?: InputEventHandlerUnion<T, InputEvent>;
    onbeforematch?: EventHandlerUnion<T, Event>;
    onbeforepaste?: EventHandlerUnion<T, ClipboardEvent>;
    onbeforetoggle?: EventHandlerUnion<T, ToggleEvent>;
    onbeforexrselect?: EventHandlerUnion<T, Event>;
    onblur?: EventHandlerUnion<T, FocusEvent>;
    oncancel?: EventHandlerUnion<T, Event>;
    oncanplay?: EventHandlerUnion<T, Event>;
    oncanplaythrough?: EventHandlerUnion<T, Event>;
    onchange?: InputEventHandlerUnion<T, Event>;
    onclick?: EventHandlerUnion<T, MouseEvent>;
    onclose?: EventHandlerUnion<T, Event>;
    oncommand?: EventHandlerUnion<T, CommandEvent>;
    oncompositionend?: EventHandlerUnion<T, CompositionEvent>;
    oncompositionstart?: EventHandlerUnion<T, CompositionEvent>;
    oncompositionupdate?: EventHandlerUnion<T, CompositionEvent>;
    oncontentvisibilityautostatechange?: EventHandlerUnion<
      T,
      ContentVisibilityAutoStateChangeEvent
    >;
    oncontextlost?: EventHandlerUnion<T, Event>;
    oncontextmenu?: EventHandlerUnion<T, PointerEvent>;
    oncontextrestored?: EventHandlerUnion<T, Event>;
    oncopy?: EventHandlerUnion<T, ClipboardEvent>;
    oncuechange?: EventHandlerUnion<T, Event>;
    oncut?: EventHandlerUnion<T, ClipboardEvent>;
    ondblclick?: EventHandlerUnion<T, MouseEvent>;
    ondrag?: EventHandlerUnion<T, DragEvent>;
    ondragend?: EventHandlerUnion<T, DragEvent>;
    ondragenter?: EventHandlerUnion<T, DragEvent>;
    ondragexit?: EventHandlerUnion<T, DragEvent>;
    ondragleave?: EventHandlerUnion<T, DragEvent>;
    ondragover?: EventHandlerUnion<T, DragEvent>;
    ondragstart?: EventHandlerUnion<T, DragEvent>;
    ondrop?: EventHandlerUnion<T, DragEvent>;
    ondurationchange?: EventHandlerUnion<T, Event>;
    onemptied?: EventHandlerUnion<T, Event>;
    onended?: EventHandlerUnion<T, Event>;
    onerror?: EventHandlerUnion<T, ErrorEvent>;
    onfocus?: EventHandlerUnion<T, FocusEvent>;
    onfocusin?: EventHandlerUnion<T, FocusEvent>;
    onfocusout?: EventHandlerUnion<T, FocusEvent>;
    onformdata?: EventHandlerUnion<T, FormDataEvent>;
    onfullscreenchange?: EventHandlerUnion<T, Event>;
    onfullscreenerror?: EventHandlerUnion<T, Event>;
    oninput?: InputEventHandlerUnion<T, InputEvent>;
    oninvalid?: EventHandlerUnion<T, Event>;
    onkeydown?: EventHandlerUnion<T, KeyboardEvent>;
    onkeypress?: EventHandlerUnion<T, KeyboardEvent>;
    onkeyup?: EventHandlerUnion<T, KeyboardEvent>;
    onload?: EventHandlerUnion<T, Event>;
    onloadeddata?: EventHandlerUnion<T, Event>;
    onloadedmetadata?: EventHandlerUnion<T, Event>;
    onloadstart?: EventHandlerUnion<T, Event>;
    onmousedown?: EventHandlerUnion<T, MouseEvent>;
    onmouseenter?: EventHandlerUnion<T, MouseEvent>;
    onmouseleave?: EventHandlerUnion<T, MouseEvent>;
    onmousemove?: EventHandlerUnion<T, MouseEvent>;
    onmouseout?: EventHandlerUnion<T, MouseEvent>;
    onmouseover?: EventHandlerUnion<T, MouseEvent>;
    onmouseup?: EventHandlerUnion<T, MouseEvent>;
    onpaste?: EventHandlerUnion<T, ClipboardEvent>;
    onpause?: EventHandlerUnion<T, Event>;
    onplay?: EventHandlerUnion<T, Event>;
    onplaying?: EventHandlerUnion<T, Event>;
    onpointercancel?: EventHandlerUnion<T, PointerEvent>;
    onpointerdown?: EventHandlerUnion<T, PointerEvent>;
    onpointerenter?: EventHandlerUnion<T, PointerEvent>;
    onpointerleave?: EventHandlerUnion<T, PointerEvent>;
    onpointermove?: EventHandlerUnion<T, PointerEvent>;
    onpointerout?: EventHandlerUnion<T, PointerEvent>;
    onpointerover?: EventHandlerUnion<T, PointerEvent>;
    onpointerrawupdate?: EventHandlerUnion<T, PointerEvent>;
    onpointerup?: EventHandlerUnion<T, PointerEvent>;
    onprogress?: EventHandlerUnion<T, ProgressEvent>;
    onratechange?: EventHandlerUnion<T, Event>;
    onreset?: EventHandlerUnion<T, Event>;
    onresize?: EventHandlerUnion<T, UIEvent>;
    onscroll?: EventHandlerUnion<T, Event>;
    onscrollend?: EventHandlerUnion<T, Event>;
    onscrollsnapchange?: EventHandlerUnion<T, Event>;
    onscrollsnapchanging?: EventHandlerUnion<T, Event>;
    onsecuritypolicyviolation?: EventHandlerUnion<T, SecurityPolicyViolationEvent>;
    onseeked?: EventHandlerUnion<T, Event>;
    onseeking?: EventHandlerUnion<T, Event>;
    onselect?: EventHandlerUnion<T, Event>;
    onselectionchange?: EventHandlerUnion<T, Event>;
    onselectstart?: EventHandlerUnion<T, Event>;
    onslotchange?: EventHandlerUnion<T, Event>;
    onstalled?: EventHandlerUnion<T, Event>;
    onsubmit?: EventHandlerUnion<T, SubmitEvent>;
    onsuspend?: EventHandlerUnion<T, Event>;
    ontimeupdate?: EventHandlerUnion<T, Event>;
    ontoggle?: EventHandlerUnion<T, ToggleEvent>;
    ontouchcancel?: EventHandlerUnion<T, TouchEvent>;
    ontouchend?: EventHandlerUnion<T, TouchEvent>;
    ontouchmove?: EventHandlerUnion<T, TouchEvent>;
    ontouchstart?: EventHandlerUnion<T, TouchEvent>;
    ontransitioncancel?: EventHandlerUnion<T, TransitionEvent>;
    ontransitionend?: EventHandlerUnion<T, TransitionEvent>;
    ontransitionrun?: EventHandlerUnion<T, TransitionEvent>;
    ontransitionstart?: EventHandlerUnion<T, TransitionEvent>;
    onvolumechange?: EventHandlerUnion<T, Event>;
    onwaiting?: EventHandlerUnion<T, Event>;
    onwheel?: EventHandlerUnion<T, WheelEvent>;
  }

  /** `onKeyDownCapture`: the same event, bound in the capture phase. */
  interface DOMEventHandlersCapture<T> {
    onAbortCapture?: EventHandlerUnion<T, UIEvent>;
    onAnimationCancelCapture?: EventHandlerUnion<T, AnimationEvent>;
    onAnimationEndCapture?: EventHandlerUnion<T, AnimationEvent>;
    onAnimationIterationCapture?: EventHandlerUnion<T, AnimationEvent>;
    onAnimationStartCapture?: EventHandlerUnion<T, AnimationEvent>;
    onAuxClickCapture?: EventHandlerUnion<T, PointerEvent>;
    onBeforeCopyCapture?: EventHandlerUnion<T, ClipboardEvent>;
    onBeforeCutCapture?: EventHandlerUnion<T, ClipboardEvent>;
    onBeforeInputCapture?: InputEventHandlerUnion<T, InputEvent>;
    onBeforeMatchCapture?: EventHandlerUnion<T, Event>;
    onBeforePasteCapture?: EventHandlerUnion<T, ClipboardEvent>;
    onBeforeToggleCapture?: EventHandlerUnion<T, ToggleEvent>;
    onBeforeXRSelectCapture?: EventHandlerUnion<T, Event>;
    onBlurCapture?: EventHandlerUnion<T, FocusEvent>;
    onCancelCapture?: EventHandlerUnion<T, Event>;
    onCanPlayCapture?: EventHandlerUnion<T, Event>;
    onCanPlayThroughCapture?: EventHandlerUnion<T, Event>;
    onChangeCapture?: InputEventHandlerUnion<T, Event>;
    onClickCapture?: EventHandlerUnion<T, MouseEvent>;
    onCloseCapture?: EventHandlerUnion<T, Event>;
    onCommandCapture?: EventHandlerUnion<T, CommandEvent>;
    onCompositionEndCapture?: EventHandlerUnion<T, CompositionEvent>;
    onCompositionStartCapture?: EventHandlerUnion<T, CompositionEvent>;
    onCompositionUpdateCapture?: EventHandlerUnion<T, CompositionEvent>;
    onContentVisibilityAutoStateChangeCapture?: EventHandlerUnion<
      T,
      ContentVisibilityAutoStateChangeEvent
    >;
    onContextLostCapture?: EventHandlerUnion<T, Event>;
    onContextMenuCapture?: EventHandlerUnion<T, PointerEvent>;
    onContextRestoredCapture?: EventHandlerUnion<T, Event>;
    onCopyCapture?: EventHandlerUnion<T, ClipboardEvent>;
    onCueChangeCapture?: EventHandlerUnion<T, Event>;
    onCutCapture?: EventHandlerUnion<T, ClipboardEvent>;
    onDblClickCapture?: EventHandlerUnion<T, MouseEvent>;
    onDragCapture?: EventHandlerUnion<T, DragEvent>;
    onDragEndCapture?: EventHandlerUnion<T, DragEvent>;
    onDragEnterCapture?: EventHandlerUnion<T, DragEvent>;
    onDragExitCapture?: EventHandlerUnion<T, DragEvent>;
    onDragLeaveCapture?: EventHandlerUnion<T, DragEvent>;
    onDragOverCapture?: EventHandlerUnion<T, DragEvent>;
    onDragStartCapture?: EventHandlerUnion<T, DragEvent>;
    onDropCapture?: EventHandlerUnion<T, DragEvent>;
    onDurationChangeCapture?: EventHandlerUnion<T, Event>;
    onEmptiedCapture?: EventHandlerUnion<T, Event>;
    onEndedCapture?: EventHandlerUnion<T, Event>;
    onErrorCapture?: EventHandlerUnion<T, ErrorEvent>;
    onFocusCapture?: EventHandlerUnion<T, FocusEvent>;
    onFocusInCapture?: EventHandlerUnion<T, FocusEvent>;
    onFocusOutCapture?: EventHandlerUnion<T, FocusEvent>;
    onFormDataCapture?: EventHandlerUnion<T, FormDataEvent>;
    onFullscreenChangeCapture?: EventHandlerUnion<T, Event>;
    onFullscreenErrorCapture?: EventHandlerUnion<T, Event>;
    onInputCapture?: InputEventHandlerUnion<T, InputEvent>;
    onInvalidCapture?: EventHandlerUnion<T, Event>;
    onKeyDownCapture?: EventHandlerUnion<T, KeyboardEvent>;
    onKeyPressCapture?: EventHandlerUnion<T, KeyboardEvent>;
    onKeyUpCapture?: EventHandlerUnion<T, KeyboardEvent>;
    onLoadCapture?: EventHandlerUnion<T, Event>;
    onLoadedDataCapture?: EventHandlerUnion<T, Event>;
    onLoadedMetadataCapture?: EventHandlerUnion<T, Event>;
    onLoadStartCapture?: EventHandlerUnion<T, Event>;
    onMouseDownCapture?: EventHandlerUnion<T, MouseEvent>;
    onMouseEnterCapture?: EventHandlerUnion<T, MouseEvent>;
    onMouseLeaveCapture?: EventHandlerUnion<T, MouseEvent>;
    onMouseMoveCapture?: EventHandlerUnion<T, MouseEvent>;
    onMouseOutCapture?: EventHandlerUnion<T, MouseEvent>;
    onMouseOverCapture?: EventHandlerUnion<T, MouseEvent>;
    onMouseUpCapture?: EventHandlerUnion<T, MouseEvent>;
    onPasteCapture?: EventHandlerUnion<T, ClipboardEvent>;
    onPauseCapture?: EventHandlerUnion<T, Event>;
    onPlayCapture?: EventHandlerUnion<T, Event>;
    onPlayingCapture?: EventHandlerUnion<T, Event>;
    onPointerCancelCapture?: EventHandlerUnion<T, PointerEvent>;
    onPointerDownCapture?: EventHandlerUnion<T, PointerEvent>;
    onPointerEnterCapture?: EventHandlerUnion<T, PointerEvent>;
    onPointerLeaveCapture?: EventHandlerUnion<T, PointerEvent>;
    onPointerMoveCapture?: EventHandlerUnion<T, PointerEvent>;
    onPointerOutCapture?: EventHandlerUnion<T, PointerEvent>;
    onPointerOverCapture?: EventHandlerUnion<T, PointerEvent>;
    onPointerRawUpdateCapture?: EventHandlerUnion<T, PointerEvent>;
    onPointerUpCapture?: EventHandlerUnion<T, PointerEvent>;
    onProgressCapture?: EventHandlerUnion<T, ProgressEvent>;
    onRateChangeCapture?: EventHandlerUnion<T, Event>;
    onResetCapture?: EventHandlerUnion<T, Event>;
    onResizeCapture?: EventHandlerUnion<T, UIEvent>;
    onScrollCapture?: EventHandlerUnion<T, Event>;
    onScrollEndCapture?: EventHandlerUnion<T, Event>;
    onScrollSnapChangeCapture?: EventHandlerUnion<T, Event>;
    onScrollSnapChangingCapture?: EventHandlerUnion<T, Event>;
    onSecurityPolicyViolationCapture?: EventHandlerUnion<T, SecurityPolicyViolationEvent>;
    onSeekedCapture?: EventHandlerUnion<T, Event>;
    onSeekingCapture?: EventHandlerUnion<T, Event>;
    onSelectCapture?: EventHandlerUnion<T, Event>;
    onSelectionChangeCapture?: EventHandlerUnion<T, Event>;
    onSelectStartCapture?: EventHandlerUnion<T, Event>;
    onSlotChangeCapture?: EventHandlerUnion<T, Event>;
    onStalledCapture?: EventHandlerUnion<T, Event>;
    onSubmitCapture?: EventHandlerUnion<T, SubmitEvent>;
    onSuspendCapture?: EventHandlerUnion<T, Event>;
    onTimeUpdateCapture?: EventHandlerUnion<T, Event>;
    onToggleCapture?: EventHandlerUnion<T, ToggleEvent>;
    onTouchCancelCapture?: EventHandlerUnion<T, TouchEvent>;
    onTouchEndCapture?: EventHandlerUnion<T, TouchEvent>;
    onTouchMoveCapture?: EventHandlerUnion<T, TouchEvent>;
    onTouchStartCapture?: EventHandlerUnion<T, TouchEvent>;
    onTransitionCancelCapture?: EventHandlerUnion<T, TransitionEvent>;
    onTransitionEndCapture?: EventHandlerUnion<T, TransitionEvent>;
    onTransitionRunCapture?: EventHandlerUnion<T, TransitionEvent>;
    onTransitionStartCapture?: EventHandlerUnion<T, TransitionEvent>;
    onVolumeChangeCapture?: EventHandlerUnion<T, Event>;
    onWaitingCapture?: EventHandlerUnion<T, Event>;
    onWheelCapture?: EventHandlerUnion<T, WheelEvent>;
  }

  /**
   * `prop:` writes a property where the compiler would pick an attribute from
   * the name, which is how a custom element is handed a value that is not a
   * string.
   */
  interface NamespacedAttributes {
    [key: `prop:${string}`]: unknown;
  }

  interface AriaAttributes {
    "aria-activedescendant"?: Attr<string>;
    "aria-atomic"?: Attr<AriaBoolean>;
    "aria-braillelabel"?: Attr<string>;
    "aria-brailleroledescription"?: Attr<string>;
    "aria-autocomplete"?: Attr<"none" | "inline" | "list" | "both">;
    "aria-busy"?: Attr<AriaBoolean>;
    "aria-checked"?: Attr<AriaBoolean | "mixed">;
    "aria-colcount"?: Attr<number | string>;
    "aria-colindex"?: Attr<number | string>;
    "aria-colindextext"?: Attr<number | string>;
    "aria-colspan"?: Attr<number | string>;
    "aria-controls"?: Attr<string>;
    "aria-current"?: Attr<AriaBoolean | "page" | "step" | "location" | "date" | "time">;
    "aria-describedby"?: Attr<string>;
    "aria-description"?: Attr<string>;
    "aria-details"?: Attr<string>;
    "aria-disabled"?: Attr<AriaBoolean>;
    /** @deprecated */
    "aria-dropeffect"?: Attr<"none" | "copy" | "execute" | "link" | "move" | "popup">;
    "aria-errormessage"?: Attr<string>;
    "aria-expanded"?: Attr<AriaBoolean>;
    "aria-flowto"?: Attr<string>;
    /** @deprecated */
    "aria-grabbed"?: Attr<AriaBoolean>;
    "aria-haspopup"?: Attr<AriaBoolean | "menu" | "listbox" | "tree" | "grid" | "dialog">;
    "aria-hidden"?: Attr<AriaBoolean>;
    "aria-invalid"?: Attr<AriaBoolean | "grammar" | "spelling">;
    "aria-keyshortcuts"?: Attr<string>;
    "aria-label"?: Attr<string>;
    "aria-labelledby"?: Attr<string>;
    "aria-level"?: Attr<number | string>;
    "aria-live"?: Attr<"off" | "assertive" | "polite">;
    "aria-modal"?: Attr<AriaBoolean>;
    "aria-multiline"?: Attr<AriaBoolean>;
    "aria-multiselectable"?: Attr<AriaBoolean>;
    "aria-orientation"?: Attr<"horizontal" | "vertical">;
    "aria-owns"?: Attr<string>;
    "aria-placeholder"?: Attr<string>;
    "aria-posinset"?: Attr<number | string>;
    "aria-pressed"?: Attr<AriaBoolean | "mixed">;
    "aria-readonly"?: Attr<AriaBoolean>;
    "aria-relevant"?: Attr<
      | "additions"
      | "additions removals"
      | "additions text"
      | "all"
      | "removals"
      | "removals additions"
      | "removals text"
      | "text"
      | "text additions"
      | "text removals"
    >;
    "aria-required"?: Attr<AriaBoolean>;
    "aria-roledescription"?: Attr<string>;
    "aria-rowcount"?: Attr<number | string>;
    "aria-rowindex"?: Attr<number | string>;
    "aria-rowindextext"?: Attr<number | string>;
    "aria-rowspan"?: Attr<number | string>;
    "aria-selected"?: Attr<AriaBoolean>;
    "aria-setsize"?: Attr<number | string>;
    "aria-sort"?: Attr<"none" | "ascending" | "descending" | "other">;
    "aria-valuemax"?: Attr<number | string>;
    "aria-valuemin"?: Attr<number | string>;
    "aria-valuenow"?: Attr<number | string>;
    "aria-valuetext"?: Attr<string>;
    role?: Attr<AriaRole | (string & {})>;
  }

  type AriaRole =
    | "alert"
    | "alertdialog"
    | "application"
    | "article"
    | "banner"
    | "button"
    | "cell"
    | "checkbox"
    | "columnheader"
    | "combobox"
    | "complementary"
    | "contentinfo"
    | "definition"
    | "dialog"
    | "directory"
    | "document"
    | "feed"
    | "figure"
    | "form"
    | "grid"
    | "gridcell"
    | "group"
    | "heading"
    | "img"
    | "link"
    | "list"
    | "listbox"
    | "listitem"
    | "log"
    | "main"
    | "marquee"
    | "math"
    | "menu"
    | "menubar"
    | "menuitem"
    | "menuitemcheckbox"
    | "menuitemradio"
    | "meter"
    | "navigation"
    | "none"
    | "note"
    | "option"
    | "presentation"
    | "progressbar"
    | "radio"
    | "radiogroup"
    | "region"
    | "row"
    | "rowgroup"
    | "rowheader"
    | "scrollbar"
    | "search"
    | "searchbox"
    | "separator"
    | "slider"
    | "spinbutton"
    | "status"
    | "switch"
    | "tab"
    | "table"
    | "tablist"
    | "tabpanel"
    | "term"
    | "textbox"
    | "timer"
    | "toolbar"
    | "tooltip"
    | "tree"
    | "treegrid"
    | "treeitem";

  /** What every element takes, whatever its namespace. */
  export interface ElementAttributes<T extends globalThis.Element>
    extends
      DOMEventHandlers<T>,
      DOMEventHandlersLowerCase<T>,
      DOMEventHandlersCapture<T>,
      NamespacedAttributes,
      AriaAttributes,
      CallSite<AsDeclared> {
    /**
     * Lowercase only: a name ending in `Capture` binds its event in the capture
     * phase, so the camelCase spelling of these two would listen for `gotpointer`
     * and `lostpointer`.
     */
    ongotpointercapture?: EventHandlerUnion<T, PointerEvent>;
    onlostpointercapture?: EventHandlerUnion<T, PointerEvent>;

    id?: Attr<string>;
    class?: Attr<ClassValue>;
    className?: Attr<ClassValue>;
    style?: Attr<string | CSSProperties>;
    tabindex?: Attr<number | string>;
    tabIndex?: Attr<number | string>;
    lang?: Attr<string>;
    slot?: Attr<string>;
    part?: Attr<string>;
    nonce?: Attr<string>;
    elementtiming?: Attr<string>;
    autofocus?: Attr<BooleanAttribute>;
    autoFocus?: Attr<BooleanAttribute>;

    dangerouslySetInnerHTML?: { __html: string };
    innerHTML?: Attr<string>;
    textContent?: Attr<string | number>;

    [key: `data-${string}`]: Attr<string | number | boolean>;

    /** A callback, a `{ current }` holder, or a list of either. */
    ref?: Ref<T> | readonly Ref<T>[];
    children?: Child | Child[];
  }

  /** What every HTML element takes. */
  export interface HTMLAttributes<T extends HTMLElement> extends ElementAttributes<T> {
    innerText?: Attr<string | number>;

    accesskey?: Attr<string>;
    accessKey?: Attr<string>;
    autocapitalize?: Attr<HTMLAutocapitalize>;
    autocorrect?: Attr<"on" | "off">;
    // The HTML spelling, which is what `bind:value` on an editable host looks
    // for: the compiler reads either, so both are declared.
    contenteditable?: Attr<boolean | "true" | "false" | "inherit" | "plaintext-only" | "">;
    contentEditable?: Attr<boolean | "true" | "false" | "inherit" | "plaintext-only" | "">;
    dir?: Attr<HTMLDir>;
    draggable?: Attr<boolean | "true" | "false">;
    enterkeyhint?: Attr<"enter" | "done" | "go" | "next" | "previous" | "search" | "send">;
    enterKeyHint?: Attr<"enter" | "done" | "go" | "next" | "previous" | "search" | "send">;
    exportparts?: Attr<string>;
    hidden?: Attr<boolean | "" | "hidden" | "until-found">;
    inert?: Attr<BooleanAttribute>;
    inputmode?: Attr<"none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search">;
    inputMode?: Attr<"none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search">;
    is?: Attr<string>;
    popover?: Attr<boolean | "" | "auto" | "manual" | "hint">;
    spellcheck?: Attr<boolean | "true" | "false" | "">;
    title?: Attr<string>;
    translate?: Attr<"yes" | "no">;
    virtualkeyboardpolicy?: Attr<"" | "auto" | "manual">;
    writingsuggestions?: Attr<EnumeratedPseudoBoolean>;

    itemid?: Attr<string>;
    itemprop?: Attr<string>;
    itemref?: Attr<string>;
    itemscope?: Attr<BooleanAttribute>;
    itemtype?: Attr<string>;

    about?: Attr<string>;
    datatype?: Attr<string>;
    inlist?: Attr<unknown>;
    prefix?: Attr<string>;
    property?: Attr<string>;
    resource?: Attr<string>;
    typeof?: Attr<string>;
    vocab?: Attr<string>;

    /**
     * `bind:` — the two-way channel.
     *
     * The property written and the event that reports a user edit are both
     * resolved at COMPILE time from the tag and the `type`: a text input writes
     * `value` and reports on `input`, a checkbox writes `checked` on `change`, a
     * number input writes `valueAsNumber`, a date input `valueAsDate`, a
     * `contenteditable` host its `textContent`. `bind:this` is a ref.
     *
     * The target has to be WRITABLE, which is what [`Bindable`] states: a
     * read-only accessor reaching one of these is the mistake the type exists to
     * catch, and the runtime answers it with `BIND_TARGET_NOT_WRITABLE`.
     *
     * `bind:value` is deliberately wide. Which of these a given element takes
     * depends on its tag and its `type` attribute, and the props type is not
     * generic over either.
     */
    "bind:value"?: Bindable<string | number | boolean | Date | string[] | null>;
    "bind:checked"?: Bindable<boolean>;
    "bind:group"?: Bindable<string>;
    "bind:files"?: Bindable<FileList | null>;
    "bind:open"?: Bindable<boolean>;
    "bind:this"?: T | ((el: T) => void) | { current: T | null };
    /**
     * Any other property, because that is the runtime's own rule: a `bind:` name
     * that is not one of the four special cases binds the property of that name
     * and reports on `change`.
     */
    [key: `bind:${string}`]:
      | Bindable<unknown>
      | T
      | ((el: T) => void)
      | { current: T | null }
      | undefined;
  }

  /** An element whose attributes this file cannot know. */
  export interface CustomElementAttributes extends HTMLAttributes<HTMLElement> {
    [name: string]: unknown;
  }

  type HTMLAutocapitalize = "off" | "none" | "on" | "sentences" | "words" | "characters";
  type HTMLAutocomplete =
    | "additional-name"
    | "address-level1"
    | "address-level2"
    | "address-level3"
    | "address-level4"
    | "address-line1"
    | "address-line2"
    | "address-line3"
    | "bday"
    | "bday-day"
    | "bday-month"
    | "bday-year"
    | "billing"
    | "cc-additional-name"
    | "cc-csc"
    | "cc-exp"
    | "cc-exp-month"
    | "cc-exp-year"
    | "cc-family-name"
    | "cc-given-name"
    | "cc-name"
    | "cc-number"
    | "cc-type"
    | "country"
    | "country-name"
    | "current-password"
    | "email"
    | "family-name"
    | "fax"
    | "given-name"
    | "home"
    | "honorific-prefix"
    | "honorific-suffix"
    | "impp"
    | "language"
    | "mobile"
    | "name"
    | "new-password"
    | "nickname"
    | "off"
    | "on"
    | "organization"
    | "organization-title"
    | "pager"
    | "photo"
    | "postal-code"
    | "sex"
    | "shipping"
    | "street-address"
    | "tel"
    | "tel-area-code"
    | "tel-country-code"
    | "tel-extension"
    | "tel-local"
    | "tel-local-prefix"
    | "tel-local-suffix"
    | "tel-national"
    | "transaction-amount"
    | "transaction-currency"
    | "url"
    | "username"
    | "work"
    | (string & {});
  type HTMLDir = "ltr" | "rtl" | "auto";
  type HTMLFormEncType = "application/x-www-form-urlencoded" | "multipart/form-data" | "text/plain";
  type HTMLFormMethod = "post" | "get" | "dialog";
  type HTMLCrossorigin = "anonymous" | "use-credentials" | EnumeratedAcceptsEmpty;
  type HTMLFetchPriority = "high" | "low" | "auto";
  type HTMLReferrerPolicy = ReferrerPolicy;
  type HTMLIframeSandbox =
    | "allow-downloads-without-user-activation"
    | "allow-downloads"
    | "allow-forms"
    | "allow-modals"
    | "allow-orientation-lock"
    | "allow-pointer-lock"
    | "allow-popups"
    | "allow-popups-to-escape-sandbox"
    | "allow-presentation"
    | "allow-same-origin"
    | "allow-scripts"
    | "allow-storage-access-by-user-activation"
    | "allow-top-navigation"
    | "allow-top-navigation-by-user-activation"
    | "allow-top-navigation-to-custom-protocols";
  type HTMLPreloadAs = "fetch" | "font" | "image" | "script" | "style" | "track";
  type HTMLLinkAs = HTMLPreloadAs | "audio" | "document" | "embed" | "object" | "video" | "worker";

  /**
   * What an `action()` hands back, and the only value shape B8's `action` slot
   * accepts besides a URL. The arguments are the action's own; a `<form>`
   * submission calls it with the `FormData`, so a zero-arity action is legal
   * too.
   */
  export type FormAction = (...args: never[]) => Promise<unknown>;

  export interface HtmlHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    manifest?: Attr<string>;
    xmlns?: Attr<string>;
  }

  export interface AnchorHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    xmlns?: Attr<string>;
    download?: Attr<(string & {}) | EnumeratedAcceptsEmpty>;
    href?: Attr<string>;
    hreflang?: Attr<string>;
    ping?: Attr<string>;
    referrerpolicy?: Attr<HTMLReferrerPolicy>;
    referrerPolicy?: Attr<HTMLReferrerPolicy>;
    rel?: Attr<string>;
    target?: Attr<"_self" | "_blank" | "_parent" | "_top" | (string & {})>;
    type?: Attr<string>;
    attributionsrc?: Attr<string>;
    /** @deprecated */
    charset?: Attr<string>;
    /** @deprecated */
    charSet?: Attr<string>;
    /** @deprecated */
    coords?: Attr<string>;
    /** @deprecated */
    name?: Attr<string>;
    /** @deprecated */
    rev?: Attr<string>;
    /** @deprecated */
    shape?: Attr<"rect" | "circle" | "poly" | "default">;
  }

  export interface AreaHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    alt?: Attr<string>;
    coords?: Attr<string>;
    download?: Attr<(string & {}) | EnumeratedAcceptsEmpty>;
    href?: Attr<string>;
    ping?: Attr<string>;
    referrerpolicy?: Attr<HTMLReferrerPolicy>;
    referrerPolicy?: Attr<HTMLReferrerPolicy>;
    rel?: Attr<string>;
    shape?: Attr<"rect" | "circle" | "poly" | "default">;
    target?: Attr<"_self" | "_blank" | "_parent" | "_top" | (string & {})>;
    attributionsrc?: Attr<string>;
    /** @deprecated */
    nohref?: Attr<BooleanAttribute>;
  }

  export interface AudioHTMLAttributes<T extends HTMLElement> extends MediaHTMLAttributes<T> {}

  export interface BaseHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    href?: Attr<string>;
    target?: Attr<"_self" | "_blank" | "_parent" | "_top" | (string & {})>;
  }

  export interface BdoHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    dir?: Attr<"ltr" | "rtl">;
  }

  export interface BlockquoteHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    cite?: Attr<string>;
  }

  export interface BodyHTMLAttributes<T extends HTMLElement>
    extends HTMLAttributes<T>, WindowEventHandlers<T> {}

  export interface ButtonHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    disabled?: Attr<BooleanAttribute>;
    form?: Attr<string>;
    formaction?: Attr<string>;
    formAction?: Attr<string>;
    formenctype?: Attr<HTMLFormEncType>;
    formmethod?: Attr<HTMLFormMethod>;
    formMethod?: Attr<HTMLFormMethod>;
    formnovalidate?: Attr<BooleanAttribute>;
    formNoValidate?: Attr<BooleanAttribute>;
    formtarget?: Attr<"_self" | "_blank" | "_parent" | "_top" | (string & {})>;
    formTarget?: Attr<"_self" | "_blank" | "_parent" | "_top" | (string & {})>;
    name?: Attr<string>;
    popovertarget?: Attr<string>;
    popovertargetaction?: Attr<"hide" | "show" | "toggle">;
    type?: Attr<"submit" | "reset" | "button" | "menu">;
    value?: Attr<string | number>;
    command?: Attr<
      "show-modal" | "close" | "show-popover" | "hide-popover" | "toggle-popover" | (string & {})
    >;
    commandfor?: Attr<string>;
  }

  export interface CanvasHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    height?: Attr<number | string>;
    width?: Attr<number | string>;
    /** @deprecated */
    "moz-opaque"?: Attr<BooleanAttribute>;
  }

  export interface CaptionHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    /** @deprecated */
    align?: Attr<"left" | "center" | "right">;
  }

  export interface ColHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    span?: Attr<number | string>;
    /** @deprecated */
    align?: Attr<"left" | "center" | "right" | "justify" | "char">;
    /** @deprecated */
    bgcolor?: Attr<string>;
    /** @deprecated */
    char?: Attr<string>;
    /** @deprecated */
    charoff?: Attr<string>;
    /** @deprecated */
    valign?: Attr<"baseline" | "bottom" | "middle" | "top">;
    /** @deprecated */
    width?: Attr<number | string>;
  }

  export interface ColgroupHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    span?: Attr<number | string>;
    /** @deprecated */
    align?: Attr<"left" | "center" | "right" | "justify" | "char">;
    /** @deprecated */
    bgcolor?: Attr<string>;
    /** @deprecated */
    char?: Attr<string>;
    /** @deprecated */
    charoff?: Attr<string>;
    /** @deprecated */
    valign?: Attr<"baseline" | "bottom" | "middle" | "top">;
    /** @deprecated */
    width?: Attr<number | string>;
  }

  export interface DataHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    value?: Attr<string | string[] | number>;
  }

  export interface DetailsHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    name?: Attr<string>;
    open?: Attr<BooleanAttribute>;
  }

  export interface DialogHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    open?: Attr<BooleanAttribute>;
    tabindex?: Attr<never>;
    tabIndex?: Attr<never>;
    closedby?: Attr<"any" | "closerequest" | "none">;
  }

  export interface EmbedHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    height?: Attr<number | string>;
    src?: Attr<string>;
    type?: Attr<string>;
    width?: Attr<number | string>;
    /** @deprecated */
    align?: Attr<"left" | "right" | "justify" | "center">;
    /** @deprecated */
    name?: Attr<string>;
  }

  export interface FieldsetHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    disabled?: Attr<BooleanAttribute>;
    form?: Attr<string>;
    name?: Attr<string>;
  }

  /**
   * `<form>` is the one tag whose `action` is decided by the SLOT rather than
   * by the value's shape: a URL, or the `action()` a submission calls. The
   * compiler lowers the second to a submit listener owned by the position.
   */
  export interface FormHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    "accept-charset"?: Attr<string>;
    autocomplete?: Attr<"on" | "off">;
    encoding?: Attr<HTMLFormEncType>;
    enctype?: Attr<HTMLFormEncType>;
    method?: Attr<HTMLFormMethod>;
    name?: Attr<string>;
    novalidate?: Attr<BooleanAttribute>;
    noValidate?: Attr<BooleanAttribute>;
    rel?: Attr<string>;
    target?: Attr<"_self" | "_blank" | "_parent" | "_top" | (string & {})>;
    /** @deprecated */
    accept?: Attr<string>;
    action?: FunctionMaybe<string> | FormAction;
  }

  export interface IframeHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    allow?: Attr<string>;
    allowfullscreen?: Attr<BooleanAttribute>;
    allowFullScreen?: Attr<BooleanAttribute>;
    height?: Attr<number | string>;
    loading?: Attr<"eager" | "lazy">;
    name?: Attr<string>;
    referrerpolicy?: Attr<HTMLReferrerPolicy>;
    referrerPolicy?: Attr<HTMLReferrerPolicy>;
    sandbox?: Attr<HTMLIframeSandbox | (string & {})>;
    src?: Attr<string>;
    srcdoc?: Attr<string>;
    width?: Attr<number | string>;
    adauctionheaders?: Attr<BooleanAttribute>;
    browsingtopics?: Attr<BooleanAttribute>;
    credentialless?: Attr<BooleanAttribute>;
    csp?: Attr<string>;
    privatetoken?: Attr<string>;
    sharedstoragewritable?: Attr<BooleanAttribute>;
    /** @deprecated */
    align?: Attr<string>;
    /** @deprecated */
    allowpaymentrequest?: Attr<BooleanAttribute>;
    /** @deprecated */
    allowtransparency?: Attr<BooleanAttribute>;
    /** @deprecated */
    frameborder?: Attr<number | string>;
    /** @deprecated */
    longdesc?: Attr<string>;
    /** @deprecated */
    marginheight?: Attr<number | string>;
    /** @deprecated */
    marginwidth?: Attr<number | string>;
    /** @deprecated */
    scrolling?: Attr<"yes" | "no" | "auto">;
    /** @deprecated */
    seamless?: Attr<BooleanAttribute>;
  }

  export interface ImgHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    alt?: Attr<string>;
    browsingtopics?: Attr<string>;
    crossorigin?: Attr<HTMLCrossorigin>;
    crossOrigin?: Attr<HTMLCrossorigin>;
    decoding?: Attr<"sync" | "async" | "auto">;
    fetchpriority?: Attr<HTMLFetchPriority>;
    fetchPriority?: Attr<HTMLFetchPriority>;
    height?: Attr<number | string>;
    ismap?: Attr<BooleanAttribute>;
    loading?: Attr<"eager" | "lazy">;
    referrerpolicy?: Attr<HTMLReferrerPolicy>;
    referrerPolicy?: Attr<HTMLReferrerPolicy>;
    sizes?: Attr<string>;
    src?: Attr<string>;
    srcset?: Attr<string>;
    usemap?: Attr<string>;
    width?: Attr<number | string>;
    attributionsrc?: Attr<string>;
    sharedstoragewritable?: Attr<BooleanAttribute>;
    /** @deprecated */
    align?: Attr<"top" | "middle" | "bottom" | "left" | "right">;
    /** @deprecated */
    border?: Attr<string>;
    /** @deprecated */
    hspace?: Attr<number | string>;
    /** @deprecated */
    intrinsicsize?: Attr<string>;
    /** @deprecated */
    longdesc?: Attr<string>;
    /** @deprecated */
    lowsrc?: Attr<string>;
    /** @deprecated */
    name?: Attr<string>;
    /** @deprecated */
    vspace?: Attr<number | string>;
  }

  export interface InputHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    accept?: Attr<string>;
    alpha?: Attr<BooleanAttribute>;
    alt?: Attr<string>;
    autocomplete?: Attr<HTMLAutocomplete>;
    capture?: Attr<"user" | "environment">;
    colorspace?: Attr<string>;
    dirname?: Attr<string>;
    disabled?: Attr<BooleanAttribute>;
    form?: Attr<string>;
    formaction?: Attr<string>;
    formAction?: Attr<string>;
    formenctype?: Attr<HTMLFormEncType>;
    formmethod?: Attr<HTMLFormMethod>;
    formMethod?: Attr<HTMLFormMethod>;
    formnovalidate?: Attr<BooleanAttribute>;
    formNoValidate?: Attr<BooleanAttribute>;
    formtarget?: Attr<string>;
    formTarget?: Attr<string>;
    height?: Attr<number | string>;
    list?: Attr<string>;
    max?: Attr<number | string>;
    maxlength?: Attr<number | string>;
    maxLength?: Attr<number | string>;
    min?: Attr<number | string>;
    minlength?: Attr<number | string>;
    minLength?: Attr<number | string>;
    multiple?: Attr<BooleanAttribute>;
    name?: Attr<string>;
    pattern?: Attr<string>;
    placeholder?: Attr<string>;
    popovertarget?: Attr<string>;
    popovertargetaction?: Attr<"hide" | "show" | "toggle">;
    readonly?: Attr<BooleanAttribute>;
    readOnly?: Attr<BooleanAttribute>;
    required?: Attr<BooleanAttribute>;
    results?: Attr<number>;
    size?: Attr<number | string>;
    src?: Attr<string>;
    step?: Attr<number | string>;
    type?: Attr<
      | "button"
      | "checkbox"
      | "color"
      | "date"
      | "datetime-local"
      | "email"
      | "file"
      | "hidden"
      | "image"
      | "month"
      | "number"
      | "password"
      | "radio"
      | "range"
      | "reset"
      | "search"
      | "submit"
      | "tel"
      | "text"
      | "time"
      | "url"
      | "week"
    >;
    width?: Attr<number | string>;
    webkitdirectory?: Attr<BooleanAttribute>;
    incremental?: Attr<BooleanAttribute>;
    /** @deprecated */
    align?: Attr<string>;
    /** @deprecated */
    usemap?: Attr<string>;
    checked?: Attr<boolean>;
    defaultChecked?: Attr<boolean>;
    value?: Attr<string | number | boolean | string[]>;
    defaultValue?: Attr<string | number | boolean | string[]>;
  }

  export interface ModHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    cite?: Attr<string>;
    datetime?: Attr<string>;
  }

  export interface LabelHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    for?: Attr<string>;
    htmlFor?: Attr<string>;
  }

  export interface LiHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    value?: Attr<number | string>;
    /** @deprecated */
    type?: Attr<"1" | "a" | "A" | "i" | "I">;
  }

  export interface LinkHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    as?: Attr<HTMLLinkAs>;
    blocking?: Attr<"render">;
    color?: Attr<string>;
    crossorigin?: Attr<HTMLCrossorigin>;
    crossOrigin?: Attr<HTMLCrossorigin>;
    disabled?: Attr<BooleanAttribute>;
    fetchpriority?: Attr<HTMLFetchPriority>;
    fetchPriority?: Attr<HTMLFetchPriority>;
    href?: Attr<string>;
    hreflang?: Attr<string>;
    imagesizes?: Attr<string>;
    imagesrcset?: Attr<string>;
    integrity?: Attr<string>;
    media?: Attr<string>;
    referrerpolicy?: Attr<HTMLReferrerPolicy>;
    referrerPolicy?: Attr<HTMLReferrerPolicy>;
    rel?: Attr<string>;
    sizes?: Attr<string>;
    type?: Attr<string>;
    /** @deprecated */
    charset?: Attr<string>;
    /** @deprecated */
    charSet?: Attr<string>;
    /** @deprecated */
    rev?: Attr<string>;
    /** @deprecated */
    target?: Attr<string>;
  }

  export interface MapHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    name?: Attr<string>;
  }

  export interface MediaHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    autoplay?: Attr<BooleanAttribute>;
    autoPlay?: Attr<BooleanAttribute>;
    controls?: Attr<BooleanAttribute>;
    controlslist?: Attr<
      "nodownload" | "nofullscreen" | "noplaybackrate" | "noremoteplayback" | (string & {})
    >;
    crossorigin?: Attr<HTMLCrossorigin>;
    crossOrigin?: Attr<HTMLCrossorigin>;
    disableremoteplayback?: Attr<BooleanAttribute>;
    loop?: Attr<BooleanAttribute>;
    preload?: Attr<"none" | "metadata" | "auto" | EnumeratedAcceptsEmpty>;
    src?: Attr<string>;
    onEncrypted?: EventHandlerUnion<T, MediaEncryptedEvent>;
    onencrypted?: EventHandlerUnion<T, MediaEncryptedEvent>;
    onWaitingForKey?: EventHandlerUnion<T, Event>;
    onwaitingforkey?: EventHandlerUnion<T, Event>;
    /** @deprecated */
    mediagroup?: Attr<string>;
    muted?: Attr<boolean>;
    defaultMuted?: Attr<boolean>;
  }

  export interface MenuHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    /** @deprecated */
    compact?: Attr<BooleanAttribute>;
    /** @deprecated */
    label?: Attr<string>;
    /** @deprecated */
    type?: Attr<"context" | "toolbar">;
  }

  export interface MetaHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    "http-equiv"?: Attr<
      | "content-security-policy"
      | "content-type"
      | "default-style"
      | "x-ua-compatible"
      | "refresh"
      | (string & {})
    >;
    charset?: Attr<string>;
    charSet?: Attr<string>;
    content?: Attr<string>;
    media?: Attr<string>;
    name?: Attr<string>;
    /** @deprecated */
    scheme?: Attr<string>;
  }

  export interface MeterHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    form?: Attr<string>;
    high?: Attr<number | string>;
    low?: Attr<number | string>;
    max?: Attr<number | string>;
    min?: Attr<number | string>;
    optimum?: Attr<number | string>;
    value?: Attr<string | string[] | number>;
  }

  export interface QuoteHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    cite?: Attr<string>;
  }

  export interface ObjectHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    data?: Attr<string>;
    form?: Attr<string>;
    height?: Attr<number | string>;
    name?: Attr<string>;
    type?: Attr<string>;
    width?: Attr<number | string>;
    wmode?: Attr<string>;
    /** @deprecated */
    align?: Attr<string>;
    /** @deprecated */
    archive?: Attr<string>;
    /** @deprecated */
    border?: Attr<string>;
    /** @deprecated */
    classid?: Attr<string>;
    /** @deprecated */
    code?: Attr<string>;
    /** @deprecated */
    codebase?: Attr<string>;
    /** @deprecated */
    codetype?: Attr<string>;
    /** @deprecated */
    declare?: Attr<BooleanAttribute>;
    /** @deprecated */
    hspace?: Attr<number | string>;
    /** @deprecated */
    standby?: Attr<string>;
    /** @deprecated */
    usemap?: Attr<string>;
    /** @deprecated */
    vspace?: Attr<number | string>;
    /** @deprecated */
    typemustmatch?: Attr<BooleanAttribute>;
  }

  export interface OlHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    reversed?: Attr<BooleanAttribute>;
    start?: Attr<number | string>;
    type?: Attr<"1" | "a" | "A" | "i" | "I">;
    /** @deprecated */
    compact?: Attr<BooleanAttribute>;
  }

  export interface OptgroupHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    disabled?: Attr<BooleanAttribute>;
    label?: Attr<string>;
  }

  export interface OptionHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    disabled?: Attr<BooleanAttribute>;
    label?: Attr<string>;
    selected?: Attr<boolean>;
    defaultSelected?: Attr<boolean>;
    value?: Attr<string | number | boolean | string[]>;
    defaultValue?: Attr<never>;
  }

  export interface OutputHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    for?: Attr<string>;
    htmlFor?: Attr<string>;
    form?: Attr<string>;
    name?: Attr<string>;
  }

  export interface ProgressHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    max?: Attr<number | string>;
    value?: Attr<string | string[] | number>;
  }

  export interface ScriptHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    xmlns?: Attr<string>;
    async?: Attr<BooleanAttribute>;
    blocking?: Attr<"render">;
    crossorigin?: Attr<HTMLCrossorigin>;
    crossOrigin?: Attr<HTMLCrossorigin>;
    defer?: Attr<BooleanAttribute>;
    fetchpriority?: Attr<HTMLFetchPriority>;
    fetchPriority?: Attr<HTMLFetchPriority>;
    for?: Attr<string>;
    htmlFor?: Attr<string>;
    integrity?: Attr<string>;
    nomodule?: Attr<BooleanAttribute>;
    referrerpolicy?: Attr<HTMLReferrerPolicy>;
    referrerPolicy?: Attr<HTMLReferrerPolicy>;
    src?: Attr<string>;
    type?: Attr<"importmap" | "module" | "speculationrules" | (string & {})>;
    attributionsrc?: Attr<string>;
    /** @deprecated */
    charset?: Attr<string>;
    /** @deprecated */
    charSet?: Attr<string>;
    /** @deprecated */
    event?: Attr<string>;
    /** @deprecated */
    language?: Attr<string>;
  }

  export interface SelectHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    autocomplete?: Attr<HTMLAutocomplete>;
    disabled?: Attr<BooleanAttribute>;
    form?: Attr<string>;
    multiple?: Attr<BooleanAttribute>;
    name?: Attr<string>;
    required?: Attr<BooleanAttribute>;
    size?: Attr<number | string>;
    value?: Attr<string | number | boolean | string[]>;
    defaultSelected?: Attr<never>;
    selected?: Attr<never>;
  }

  export interface SlotHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    name?: Attr<string>;
  }

  export interface SourceHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    height?: Attr<number | string>;
    media?: Attr<string>;
    sizes?: Attr<string>;
    src?: Attr<string>;
    srcset?: Attr<string>;
    type?: Attr<string>;
    width?: Attr<number | string>;
  }

  export interface StyleHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    xmlns?: Attr<string>;
    blocking?: Attr<"render">;
    media?: Attr<string>;
    /** @deprecated */
    scoped?: Attr<BooleanAttribute>;
    /** @deprecated */
    type?: Attr<string>;
  }

  export interface TdHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    colspan?: Attr<number | string>;
    colSpan?: Attr<number | string>;
    headers?: Attr<string>;
    rowspan?: Attr<number | string>;
    rowSpan?: Attr<number | string>;
    /** @deprecated */
    abbr?: Attr<string>;
    /** @deprecated */
    align?: Attr<"left" | "center" | "right" | "justify" | "char">;
    /** @deprecated */
    axis?: Attr<string>;
    /** @deprecated */
    bgcolor?: Attr<string>;
    /** @deprecated */
    char?: Attr<string>;
    /** @deprecated */
    charoff?: Attr<string>;
    /** @deprecated */
    height?: Attr<number | string>;
    /** @deprecated */
    nowrap?: Attr<BooleanAttribute>;
    /** @deprecated */
    scope?: Attr<"col" | "row" | "rowgroup" | "colgroup">;
    /** @deprecated */
    valign?: Attr<"baseline" | "bottom" | "middle" | "top">;
    /** @deprecated */
    width?: Attr<number | string>;
  }

  export interface TemplateHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    shadowrootclonable?: Attr<BooleanAttribute>;
    shadowrootdelegatesfocus?: Attr<BooleanAttribute>;
    shadowrootmode?: Attr<"open" | "closed">;
    shadowrootcustomelementregistry?: Attr<BooleanAttribute>;
    shadowrootserializable?: Attr<BooleanAttribute>;
  }

  export interface TextareaHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    autocomplete?: Attr<HTMLAutocomplete>;
    cols?: Attr<number | string>;
    dirname?: Attr<string>;
    disabled?: Attr<BooleanAttribute>;
    form?: Attr<string>;
    maxlength?: Attr<number | string>;
    maxLength?: Attr<number | string>;
    minlength?: Attr<number | string>;
    minLength?: Attr<number | string>;
    name?: Attr<string>;
    placeholder?: Attr<string>;
    readonly?: Attr<BooleanAttribute>;
    readOnly?: Attr<BooleanAttribute>;
    required?: Attr<BooleanAttribute>;
    rows?: Attr<number | string>;
    wrap?: Attr<"hard" | "soft" | "off">;
    value?: Attr<string | number | boolean | string[]>;
    defaultValue?: Attr<string | string[] | number>;
  }

  export interface ThHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    abbr?: Attr<string>;
    colspan?: Attr<number | string>;
    colSpan?: Attr<number | string>;
    headers?: Attr<string>;
    rowspan?: Attr<number | string>;
    rowSpan?: Attr<number | string>;
    scope?: Attr<"col" | "row" | "rowgroup" | "colgroup">;
    /** @deprecated */
    align?: Attr<"left" | "center" | "right" | "justify" | "char">;
    /** @deprecated */
    axis?: Attr<string>;
    /** @deprecated */
    bgcolor?: Attr<string>;
    /** @deprecated */
    char?: Attr<string>;
    /** @deprecated */
    charoff?: Attr<string>;
    /** @deprecated */
    height?: Attr<string>;
    /** @deprecated */
    nowrap?: Attr<BooleanAttribute>;
    /** @deprecated */
    valign?: Attr<"baseline" | "bottom" | "middle" | "top">;
    /** @deprecated */
    width?: Attr<number | string>;
  }

  export interface TimeHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    datetime?: Attr<string>;
  }

  export interface TitleHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    xmlns?: Attr<string>;
  }

  export interface TrackHTMLAttributes<T extends HTMLElement> extends HTMLAttributes<T> {
    default?: Attr<BooleanAttribute>;
    kind?: Attr<
      | "alternative"
      | "descriptions"
      | "main"
      | "main-desc"
      | "translation"
      | "commentary"
      | "subtitles"
      | "captions"
      | "chapters"
      | "metadata"
    >;
    label?: Attr<string>;
    src?: Attr<string>;
    srclang?: Attr<string>;
    /** @deprecated */
    mediagroup?: Attr<string>;
  }

  export interface VideoHTMLAttributes<T extends HTMLElement> extends MediaHTMLAttributes<T> {
    disablepictureinpicture?: Attr<BooleanAttribute>;
    height?: Attr<number | string>;
    playsinline?: Attr<BooleanAttribute>;
    playsInline?: Attr<BooleanAttribute>;
    poster?: Attr<string>;
    width?: Attr<number | string>;
    onEnterPictureInPicture?: EventHandlerUnion<T, PictureInPictureEvent>;
    onenterpictureinpicture?: EventHandlerUnion<T, PictureInPictureEvent>;
    onLeavePictureInPicture?: EventHandlerUnion<T, PictureInPictureEvent>;
    onleavepictureinpicture?: EventHandlerUnion<T, PictureInPictureEvent>;
  }

  // MathML attributes: the MathML Core set, as Solid's own JSX types spell it.
  type MathMLAlign = "axis" | "baseline" | "bottom" | "center" | "top";
  type MathMLColumnAlign = "center" | "left" | "right";
  type MathMLLines = "dashed" | "none" | "solid";

  export interface MathMLAttributes<T extends MathMLElement> extends ElementAttributes<T> {
    dir?: Attr<"ltr" | "rtl">;
    displaystyle?: Attr<BooleanAttribute>;
    scriptlevel?: Attr<string>;
    xmlns?: Attr<string>;
  }

  export interface MathMLAnnotationAttributes extends MathMLAttributes<MathMLElement> {
    encoding?: Attr<string>;
  }

  export interface MathMLMathAttributes extends MathMLAttributes<MathMLElement> {
    display?: Attr<"block" | "inline">;
  }

  export interface MathMLMfracAttributes extends MathMLAttributes<MathMLElement> {
    linethickness?: Attr<string>;
  }

  export interface MathMLMiAttributes extends MathMLAttributes<MathMLElement> {
    mathvariant?: Attr<"normal">;
  }

  export interface MathMLMoAttributes extends MathMLAttributes<MathMLElement> {
    fence?: Attr<BooleanAttribute>;
    form?: Attr<"prefix" | "infix" | "postfix">;
    largeop?: Attr<BooleanAttribute>;
    lspace?: Attr<string>;
    maxsize?: Attr<string>;
    minsize?: Attr<string>;
    movablelimits?: Attr<BooleanAttribute>;
    rspace?: Attr<string>;
    separator?: Attr<BooleanAttribute>;
    stretchy?: Attr<BooleanAttribute>;
    symmetric?: Attr<BooleanAttribute>;
  }

  export interface MathMLMoverAttributes extends MathMLAttributes<MathMLElement> {
    accent?: Attr<BooleanAttribute>;
  }

  export interface MathMLMpaddedAttributes extends MathMLAttributes<MathMLElement> {
    depth?: Attr<string>;
    height?: Attr<string>;
    lspace?: Attr<string>;
    voffset?: Attr<string>;
    width?: Attr<string>;
  }

  export interface MathMLMspaceAttributes extends MathMLAttributes<MathMLElement> {
    depth?: Attr<string>;
    height?: Attr<string>;
    width?: Attr<string>;
  }

  export interface MathMLMtableAttributes extends MathMLAttributes<MathMLElement> {
    align?: Attr<MathMLAlign>;
    columnalign?: Attr<MathMLColumnAlign>;
    columnlines?: Attr<MathMLLines>;
    columnspacing?: Attr<string>;
    frame?: Attr<MathMLLines>;
    framespacing?: Attr<string>;
    rowalign?: Attr<MathMLAlign>;
    rowlines?: Attr<MathMLLines>;
    rowspacing?: Attr<string>;
    width?: Attr<string>;
  }

  export interface MathMLMtdAttributes extends MathMLAttributes<MathMLElement> {
    columnspan?: Attr<number | string>;
    rowspan?: Attr<number | string>;
    columnalign?: Attr<MathMLColumnAlign>;
    rowalign?: Attr<MathMLAlign>;
  }

  export interface MathMLMtrAttributes extends MathMLAttributes<MathMLElement> {
    columnalign?: Attr<MathMLColumnAlign>;
    rowalign?: Attr<MathMLAlign>;
  }

  export interface MathMLMunderAttributes extends MathMLAttributes<MathMLElement> {
    accentunder?: Attr<BooleanAttribute>;
  }

  export interface MathMLMunderoverAttributes extends MathMLAttributes<MathMLElement> {
    accent?: Attr<BooleanAttribute>;
    accentunder?: Attr<BooleanAttribute>;
  }

  // SVG attributes
  export interface SVGAttributes<T extends SVGElement> extends ElementAttributes<T> {
    // SVG-specific attributes
    viewBox?: Attr<string>;
    xmlns?: Attr<string>;
    "xmlns:xlink"?: Attr<string>;
    fill?: Attr<string>; // Also used for animation fill mode (freeze, remove)
    stroke?: Attr<string>;
    strokeWidth?: Attr<number | string>;
    "stroke-width"?: Attr<number | string>;
    strokeLinecap?: Attr<"butt" | "round" | "square">;
    "stroke-linecap"?: Attr<"butt" | "round" | "square">;
    strokeLinejoin?: Attr<"miter" | "round" | "bevel">;
    "stroke-linejoin"?: Attr<"miter" | "round" | "bevel">;
    strokeDasharray?: Attr<string>;
    "stroke-dasharray"?: Attr<string>;
    strokeDashoffset?: Attr<number | string>;
    "stroke-dashoffset"?: Attr<number | string>;
    strokeOpacity?: Attr<number | string>;
    "stroke-opacity"?: Attr<number | string>;
    fillOpacity?: Attr<number | string>;
    "fill-opacity"?: Attr<number | string>;
    opacity?: Attr<number | string>;
    transform?: Attr<string>;
    transformOrigin?: Attr<string>;
    "transform-origin"?: Attr<string>;

    // Geometry attributes
    cx?: Attr<number | string>;
    cy?: Attr<number | string>;
    r?: Attr<number | string>;
    rx?: Attr<number | string>;
    ry?: Attr<number | string>;
    x?: Attr<number | string>;
    y?: Attr<number | string>;
    x1?: Attr<number | string>;
    y1?: Attr<number | string>;
    x2?: Attr<number | string>;
    y2?: Attr<number | string>;
    width?: Attr<number | string>;
    height?: Attr<number | string>;
    d?: Attr<string>;
    points?: Attr<string>;
    pathLength?: Attr<number>;

    // Presentation attributes
    preserveAspectRatio?: Attr<string>;
    clipPathUnits?: Attr<"userSpaceOnUse" | "objectBoundingBox">;
    maskUnits?: Attr<"userSpaceOnUse" | "objectBoundingBox">;
    maskContentUnits?: Attr<"userSpaceOnUse" | "objectBoundingBox">;
    patternUnits?: Attr<"userSpaceOnUse" | "objectBoundingBox">;
    patternContentUnits?: Attr<"userSpaceOnUse" | "objectBoundingBox">;
    gradientUnits?: Attr<"userSpaceOnUse" | "objectBoundingBox">;
    gradientTransform?: Attr<string>;
    spreadMethod?: Attr<"pad" | "reflect" | "repeat">;
    offset?: Attr<number | string>;
    stopColor?: Attr<string>;
    "stop-color"?: Attr<string>;
    stopOpacity?: Attr<number | string>;
    "stop-opacity"?: Attr<number | string>;

    // Text attributes
    textAnchor?: Attr<"start" | "middle" | "end">;
    "text-anchor"?: Attr<"start" | "middle" | "end">;
    dominantBaseline?: Attr<string>;
    "dominant-baseline"?: Attr<string>;
    alignmentBaseline?: Attr<string>;
    "alignment-baseline"?: Attr<string>;
    fontSize?: Attr<string | number>;
    "font-size"?: Attr<string | number>;
    fontFamily?: Attr<string>;
    "font-family"?: Attr<string>;
    fontWeight?: Attr<string | number>;
    "font-weight"?: Attr<string | number>;
    letterSpacing?: Attr<string | number>;
    "letter-spacing"?: Attr<string | number>;
    textDecoration?: Attr<string>;
    "text-decoration"?: Attr<string>;
    dx?: Attr<string | number>;
    dy?: Attr<string | number>;

    // xlink attributes
    xlinkHref?: Attr<string>;
    "xlink:href"?: Attr<string>;
    xlinkShow?: Attr<string>;
    "xlink:show"?: Attr<string>;
    xlinkTitle?: Attr<string>;
    "xlink:title"?: Attr<string>;

    // Filter attributes
    filter?: Attr<string>;
    clipPath?: Attr<string>;
    "clip-path"?: Attr<string>;
    clipRule?: Attr<"nonzero" | "evenodd">;
    "clip-rule"?: Attr<"nonzero" | "evenodd">;
    fillRule?: Attr<"nonzero" | "evenodd">;
    "fill-rule"?: Attr<"nonzero" | "evenodd">;
    mask?: Attr<string>;
    markerStart?: Attr<string>;
    "marker-start"?: Attr<string>;
    markerMid?: Attr<string>;
    "marker-mid"?: Attr<string>;
    markerEnd?: Attr<string>;
    "marker-end"?: Attr<string>;

    // Animation attributes
    attributeName?: Attr<string>;
    attributeType?: Attr<string>;
    begin?: Attr<string>;
    dur?: Attr<string>;
    end?: Attr<string>;
    repeatCount?: Attr<number | "indefinite">;
    repeatDur?: Attr<string>;
    from?: Attr<string>;
    to?: Attr<string>;
    by?: Attr<string>;
    values?: Attr<string>;
    keyTimes?: Attr<string>;
    keySplines?: Attr<string>;
    calcMode?: Attr<"discrete" | "linear" | "paced" | "spline">;
    type?: Attr<string>;

    // Visibility
    visibility?: Attr<"visible" | "hidden" | "collapse">;
    display?: Attr<string>;

    // Misc
    href?: Attr<string>;
    result?: Attr<string>;
    in?: Attr<string>;
    in2?: Attr<string>;
    mode?: Attr<string>;
  }
}
