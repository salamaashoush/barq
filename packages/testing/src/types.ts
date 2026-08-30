import type { Block, JSXElement, Scope } from "@barqjs/core";
import type { BoundFunctions, prettyFormat, queries } from "@testing-library/dom";

/**
 * C6: the subject under test is a BLOCK, not a built node. It is constructed
 * under the scope the wrapper's providers are installed on, which is the whole
 * reason `render(() => <Badge/>, { wrapper: ThemeProvider })` can work at all.
 */
export type Ui = Block<JSXElement>;

/** C1: a wrapper is an ordinary component — scope first, `children` a Block. */
export type WrapperComponent = (s: Scope | null, props: { children: Ui }) => JSXElement;

export interface RenderOptions {
  /** Container element to render into */
  container?: HTMLElement;
  /** Base element for queries (defaults to container's parent or document.body) */
  baseElement?: HTMLElement;
  /** Wrapper component for context providers */
  wrapper?: WrapperComponent;
  /** Custom queries to use */
  queries?: typeof queries;
  /**
   * Run when this render is disposed, by `unmount()` or by `cleanup()`.
   *
   * For state that belongs to the render but is not the DOM — `renderRoute`
   * uses it to dispose the router, which otherwise keeps its history
   * subscription and loader cache alive for the rest of the run.
   */
  onUnmount?: () => void;
}

export interface RenderResult extends BoundFunctions<typeof queries> {
  /** The container element */
  container: HTMLElement;
  /** The base element for queries */
  baseElement: HTMLElement;
  /** Returns the container's innerHTML */
  asFragment: () => string;
  /** Logs the DOM tree for debugging */
  debug: (
    el?: Element | DocumentFragment | Array<Element | DocumentFragment>,
    maxLength?: number,
    options?: prettyFormat.OptionsReceived,
  ) => void;
  /** Unmounts the component and cleans up */
  unmount: () => void;
  /** Re-renders with new UI (creates new render, barq doesn't need traditional rerender) */
  rerender: (ui: Ui) => void;
}

export interface RenderHookOptions<TProps> {
  /** Initial props to pass to the hook */
  initialProps?: TProps;
  /** Wrapper component for context providers */
  wrapper?: WrapperComponent;
  /**
   * Run when this render is disposed, by `unmount()` or by `cleanup()`.
   *
   * For state that belongs to the render but is not the DOM — `renderRoute`
   * uses it to dispose the router, which otherwise keeps its history
   * subscription and loader cache alive for the rest of the run.
   */
  onUnmount?: () => void;
}

export interface RenderHookResult<TResult, TProps> {
  /** The return value of the hook */
  result: { current: TResult };
  /** Re-run the hook with new props */
  rerender: (props?: TProps) => void;
  /** Cleanup function */
  unmount: () => void;
}

export interface MountedRef {
  container: HTMLElement;
  dispose: () => void;
}
