/**
 * Barq Testing Library
 *
 * Simple and complete testing utilities for Barq components.
 * Built on top of @testing-library/dom.
 *
 * @example
 * ```tsx
 * import { render, screen, fireEvent } from "@barqjs/testing";
 * import { Counter } from "./Counter";
 *
 * test("counter increments", () => {
 *   render(() => <Counter />);
 *   expect(screen.getByText("Count: 0")).toBeInTheDocument();
 *   fireEvent.click(screen.getByRole("button"));
 *   expect(screen.getByText("Count: 1")).toBeInTheDocument();
 * });
 * ```
 */

import { flush, render as barqRender } from "@barqjs/core";
import type { JSXElement, Scope } from "@barqjs/core";
import {
  configure as configureDTL,
  fireEvent as dtlFireEvent,
  getQueriesForElement,
  prettyDOM,
} from "@testing-library/dom";

import type {
  MountedRef,
  RenderHookOptions,
  RenderHookResult,
  RenderOptions,
  RenderResult,
  Ui,
} from "./types.ts";

// Track mounted containers for cleanup
const mountedContainers = new Set<MountedRef>();

/**
 * Render a Barq component for testing
 *
 * @param ui - A function that returns a Barq component
 * @param options - Render options
 * @returns Render result with queries and utilities
 *
 * @example
 * ```tsx
 * const { getByText, container } = render(() => <MyComponent />);
 * ```
 *
 * @example With wrapper
 * ```tsx
 * const { getByText } = render(() => <MyComponent />, {
 *   wrapper: (props) => <ThemeProvider>{props.children}</ThemeProvider>
 * });
 * ```
 */
export function render(ui: Ui, options: RenderOptions = {}): RenderResult {
  const { container: customContainer, baseElement: customBaseElement, wrapper, queries } = options;

  // Set up container
  const baseElement = customBaseElement ?? customContainer ?? document.body;
  const container = customContainer ?? baseElement.appendChild(document.createElement("div"));

  // C5/C6: the subject is FORWARDED, not built. `children: ui` is the same
  // Block, so the wrapper decides when and under which scope it runs — which
  // is what makes a provider wrapper reach the component it wraps. The old
  // `() => wrapper({ children: ui() })` evaluated `ui()` as an ARGUMENT, so
  // the subject was constructed before the wrapper existed and its own JSDoc
  // example (a ThemeProvider) could not work.
  const wrappedUi: Ui = wrapper
    ? (s: Scope | null): JSXElement => wrapper(s, { children: ui })
    : ui;

  // Render the component
  const dispose = barqRender(wrappedUi, container);

  // Track for cleanup
  mountedContainers.add({ container, dispose });

  // Get query helpers bound to container
  const queryHelpers = getQueriesForElement(container, queries);

  const result: RenderResult = {
    container,
    baseElement,
    asFragment: () => container.innerHTML,
    debug: (el, maxLength, opts) => {
      if (Array.isArray(el)) {
        for (const e of el) {
          if (e instanceof Element) {
            console.log(prettyDOM(e, maxLength, opts));
          }
        }
      } else if (el instanceof Element) {
        console.log(prettyDOM(el, maxLength, opts));
      } else {
        console.log(prettyDOM(container, maxLength, opts));
      }
    },
    unmount: () => {
      dispose();
      mountedContainers.delete({ container, dispose });
    },
    rerender: (newUi: Ui) => {
      // Clean up old render
      dispose();
      container.innerHTML = "";
      // Render new UI
      const newWrappedUi: Ui = wrapper
        ? (s: Scope | null): JSXElement => wrapper(s, { children: newUi })
        : newUi;
      const newDispose = barqRender(newWrappedUi, container);
      // Update tracked ref
      mountedContainers.delete({ container, dispose });
      mountedContainers.add({ container, dispose: newDispose });
    },
    ...queryHelpers,
  };

  return result;
}

/**
 * Render a hook for testing
 *
 * @param hook - The hook function to test
 * @param options - Options including initial props and wrapper
 * @returns Result object with current value and rerender function
 *
 * @example
 * ```tsx
 * const { result } = renderHook(() => useCounter(0));
 * expect(result.current.count).toBe(0);
 * act(() => result.current.increment());
 * expect(result.current.count).toBe(1);
 * ```
 */
export function renderHook<TResult, TProps = unknown>(
  hook: (props: TProps) => TResult,
  options: RenderHookOptions<TProps> = {},
): RenderHookResult<TResult, TProps> {
  const { initialProps, wrapper } = options;

  const result: { current: TResult } = { current: undefined as TResult };
  let currentProps = initialProps;
  let dispose: () => void;
  const container = document.createElement("div");

  const renderHookComponent: Ui = (): Node => {
    result.current = hook(currentProps as TProps);
    return document.createComment("hook");
  };

  const wrappedComponent: Ui = wrapper
    ? (s: Scope | null): JSXElement => wrapper(s, { children: renderHookComponent })
    : renderHookComponent;

  dispose = barqRender(wrappedComponent, container);
  mountedContainers.add({ container, dispose });

  return {
    result,
    rerender: (newProps?: TProps) => {
      currentProps = newProps ?? currentProps;
      dispose();
      container.innerHTML = "";
      dispose = barqRender(wrappedComponent, container);
    },
    unmount: () => {
      dispose();
      mountedContainers.delete({ container, dispose });
    },
  };
}

/**
 * Clean up all mounted components
 *
 * Called automatically after each test if afterEach is available.
 * Can be called manually if needed.
 */
export function cleanup(): void {
  for (const { container, dispose } of mountedContainers) {
    try {
      dispose();
    } catch {
      // Ignore disposal errors
    }

    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
  mountedContainers.clear();
}

/**
 * Wait for a condition to be true
 *
 * Note: Barq updates are synchronous, so this is mainly useful
 * for async operations or animations.
 *
 * @param callback - Function that throws if condition not met
 * @param options - Wait options
 */
export async function waitFor<T>(
  callback: () => T | Promise<T>,
  options: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const { timeout = 1000, interval = 50 } = options;
  const startTime = Date.now();

  while (true) {
    try {
      return await callback();
    } catch (error) {
      if (Date.now() - startTime >= timeout) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}

/**
 * Act wrapper for batching updates
 *
 * Barq batches updates on the microtask queue; act() flushes them
 * synchronously after the callback so assertions see the updated DOM.
 */
export function act(callback: () => void | Promise<void>): Promise<void> {
  const result = callback();
  if (result instanceof Promise) {
    return result.then(() => flush());
  }
  flush();
  return Promise.resolve();
}

/**
 * fireEvent wrapped to flush Barq's update queue after dispatching,
 * so DOM assertions right after an event see the updated output.
 */
export const fireEvent: typeof dtlFireEvent = ((...args: Parameters<typeof dtlFireEvent>) => {
  const result = dtlFireEvent(...args);
  flush();
  return result;
}) as typeof dtlFireEvent;

for (const key of Object.keys(dtlFireEvent) as Array<keyof typeof dtlFireEvent>) {
  const original = dtlFireEvent[key] as (...args: unknown[]) => unknown;
  (fireEvent as unknown as Record<string, unknown>)[key] = (...args: unknown[]) => {
    const result = original(...args);
    flush();
    return result;
  };
}

/**
 * Configure the testing library
 */
export const configure = configureDTL;

// Re-export everything from @testing-library/dom EXCEPT screen
// We provide our own lazy screen implementation
export {
  // Queries
  getByLabelText,
  getAllByLabelText,
  queryByLabelText,
  queryAllByLabelText,
  findByLabelText,
  findAllByLabelText,
  getByPlaceholderText,
  getAllByPlaceholderText,
  queryByPlaceholderText,
  queryAllByPlaceholderText,
  findByPlaceholderText,
  findAllByPlaceholderText,
  getByText,
  getAllByText,
  queryByText,
  queryAllByText,
  findByText,
  findAllByText,
  getByAltText,
  getAllByAltText,
  queryByAltText,
  queryAllByAltText,
  findByAltText,
  findAllByAltText,
  getByTitle,
  getAllByTitle,
  queryByTitle,
  queryAllByTitle,
  findByTitle,
  findAllByTitle,
  getByDisplayValue,
  getAllByDisplayValue,
  queryByDisplayValue,
  queryAllByDisplayValue,
  findByDisplayValue,
  findAllByDisplayValue,
  getByRole,
  getAllByRole,
  queryByRole,
  queryAllByRole,
  findByRole,
  findAllByRole,
  getByTestId,
  getAllByTestId,
  queryByTestId,
  queryAllByTestId,
  findByTestId,
  findAllByTestId,
  // Utilities
  within,
  getDefaultNormalizer,
  getRoles,
  logRoles,
  isInaccessible,
  buildQueries,
  // Events
  createEvent,
  // Wait utilities
  waitFor as dtlWaitFor,
  waitForElementToBeRemoved,
  // Config
  getConfig,
  // Other
  prettyDOM,
  logDOM,
  getNodeText,
  getQueriesForElement,
  queries,
  queryHelpers,
} from "@testing-library/dom";

type ScreenQueries = ReturnType<typeof getQueriesForElement>;

/**
 * Screen object that lazily binds queries to document.body
 *
 * Unlike @testing-library/dom's screen which evaluates document.body at import time,
 * this implementation evaluates it lazily when methods are called, allowing it to work
 * with happy-dom's GlobalRegistrator which sets up globals after import.
 */
function createLazyScreen(): ScreenQueries {
  return new Proxy({} as ScreenQueries, {
    get(_target, prop: string | symbol) {
      if (typeof prop === "symbol") {
        return undefined;
      }
      if (typeof document === "undefined" || !document.body) {
        throw new TypeError(
          "For queries bound to document.body a global document has to be available. " +
            "Ensure happy-dom GlobalRegistrator.register() is called before tests run.",
        );
      }
      const boundQueries: Record<string, unknown> = getQueriesForElement(document.body);
      return boundQueries[prop];
    },
  });
}

export const screen: ScreenQueries = createLazyScreen();

/**
 * Hydration: what a browser does with a page the server rendered.
 *
 * The gap this closes was measurable — `grep -c hydrate` over this file was
 * `0`, so every suite that needed it hand-rolled one.
 */
export { installSeed, renderAndHydrate } from "./hydrate.ts";
export type { HydrateOptions, HydrationResult } from "./hydrate.ts";

// Export types
export type {
  Ui,
  RenderOptions,
  RenderResult,
  RenderHookOptions,
  RenderHookResult,
  WrapperComponent,
} from "./types.ts";
