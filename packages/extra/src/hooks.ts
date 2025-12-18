/**
 * Extra hooks - utility hooks for common patterns
 */

import { type Resource, useEffect, useResource, useState } from "@barqjs/core";

/**
 * Async data fetching with fetch API
 */
export function useFetch<T>(url: string | (() => string), options?: RequestInit): Resource<T> {
  const getUrl = typeof url === "function" ? url : () => url;

  return useResource(getUrl, async (currentUrl) => {
    const response = await fetch(currentUrl, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data: T = await response.json();
    return data;
  });
}

/**
 * Debounced value
 */
export function useDebounce<T>(source: () => T, delay: number): () => T {
  const [debounced, setDebounced] = useState(source());
  let timeout: ReturnType<typeof setTimeout>;

  useEffect(() => {
    const value = source();
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      setDebounced(value);
    }, delay);
  });

  return debounced;
}

/**
 * Throttled value
 */
export function useThrottle<T>(source: () => T, limit: number): () => T {
  const [throttled, setThrottled] = useState(source());
  let lastRun = 0;

  useEffect(() => {
    const value = source();
    const now = Date.now();

    if (now - lastRun >= limit) {
      setThrottled(value);
      lastRun = now;
    }
  });

  return throttled;
}

/**
 * Previous value
 */
export function usePrevious<T>(source: () => T): () => T | undefined {
  let prev: T | undefined;
  let current: T | undefined;

  useEffect(() => {
    prev = current;
    current = source();
  });

  return () => prev;
}

/**
 * Boolean toggle
 */
export function useToggle(initial = false): [() => boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState(initial);
  return [value, () => setValue((v) => !v), setValue];
}

/**
 * Counter with increment/decrement
 */
export function useCounter(initial = 0): {
  count: () => number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
  set: (value: number) => void;
} {
  const [count, setCount] = useState(initial);

  return {
    count,
    increment: () => setCount((c) => c + 1),
    decrement: () => setCount((c) => c - 1),
    reset: () => setCount(initial),
    set: setCount,
  };
}

/**
 * Persistent state in localStorage
 */
export function useLocalStorage<T>(key: string, initialValue: T): [() => T, (value: T) => void] {
  let initial = initialValue;

  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      const parsed: T = JSON.parse(stored);
      initial = parsed;
    }
  } catch {
    // Ignore parse errors
  }

  const [value, setValue] = useState(initial);

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value()));
  });

  return [value, setValue];
}

/**
 * Media query match
 */
export function useMediaQuery(query: string): () => boolean {
  const [matches, setMatches] = useState(false);

  if (typeof window !== "undefined") {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener("change", handler);
  }

  return matches;
}

/**
 * Window dimensions
 */
export function useWindowSize(): { width: () => number; height: () => number } {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 0);
  const [height, setHeight] = useState(typeof window !== "undefined" ? window.innerHeight : 0);

  if (typeof window !== "undefined") {
    const handler = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };
    window.addEventListener("resize", handler);
  }

  return { width, height };
}

/**
 * Intersection observer
 */
export function useIntersection(
  ref: { current: Element | null },
  options?: IntersectionObserverInit,
): () => boolean {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(ref.current);

    return () => observer.disconnect();
  });

  return isIntersecting;
}

/**
 * Click outside detection
 */
export function useClickOutside(ref: { current: Element | null }, handler: () => void): void {
  useEffect(() => {
    const listener = (event: Event) => {
      const target = event.target;
      if (!ref.current || (target instanceof Node && ref.current.contains(target))) {
        return;
      }
      handler();
    };

    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);

    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  });
}

/**
 * Keyboard shortcut
 */
export function useKeyboard(
  key: string,
  handler: (e: KeyboardEvent) => void,
  options?: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean },
): void {
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key !== key) return;
      if (options?.ctrl && !e.ctrlKey) return;
      if (options?.shift && !e.shiftKey) return;
      if (options?.alt && !e.altKey) return;
      if (options?.meta && !e.metaKey) return;

      handler(e);
    };

    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  });
}

/**
 * Document title
 */
export function useTitle(title: string | (() => string)): void {
  useEffect(() => {
    const t = typeof title === "function" ? title() : title;
    document.title = t;
  });
}

/**
 * Interval
 */
export function useInterval(callback: () => void, delay: number | null): void {
  useEffect(() => {
    if (delay === null) return;

    const id = setInterval(callback, delay);
    return () => clearInterval(id);
  });
}

/**
 * Timeout
 */
export function useTimeout(callback: () => void, delay: number | null): void {
  useEffect(() => {
    if (delay === null) return;

    const id = setTimeout(callback, delay);
    return () => clearTimeout(id);
  });
}
