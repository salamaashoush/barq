import type { BoundFunctions, prettyFormat, queries } from "@testing-library/dom";
import type { JSXElement } from "zest";

export type Ui = () => JSXElement;

export type WrapperComponent = (props: { children: JSXElement }) => JSXElement;

export interface RenderOptions {
  /** Container element to render into */
  container?: HTMLElement;
  /** Base element for queries (defaults to container's parent or document.body) */
  baseElement?: HTMLElement;
  /** Wrapper component for context providers */
  wrapper?: WrapperComponent;
  /** Custom queries to use */
  queries?: typeof queries;
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
  /** Re-renders with new UI (creates new render, zest doesn't need traditional rerender) */
  rerender: (ui: Ui) => void;
}

export interface RenderHookOptions<TProps> {
  /** Initial props to pass to the hook */
  initialProps?: TProps;
  /** Wrapper component for context providers */
  wrapper?: WrapperComponent;
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
