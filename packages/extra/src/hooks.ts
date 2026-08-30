import { type Resource, onMount, effect, resource, signal } from "@barqjs/core";

export function useFetch<T>(url: string | (() => string), options?: RequestInit): Resource<T> {
  const getUrl = typeof url === "function" ? url : () => url;

  return resource(getUrl, async (currentUrl: string) => {
    const response = await fetch(currentUrl, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data: T = await response.json();
    return data;
  });
}

export function useDebounce<T>(source: () => T, delay: number): () => T {
  const debounced = signal(source());

  effect(() => {
    const value = source();
    const timeout = setTimeout(() => {
      debounced.set(value);
    }, delay);

    return () => clearTimeout(timeout);
  });

  return debounced;
}

export function useThrottle<T>(source: () => T, limit: number): () => T {
  const throttled = signal(source());
  let lastRun = 0;

  effect(() => {
    const value = source();
    const now = Date.now();

    if (now - lastRun >= limit) {
      throttled.set(value);
      lastRun = now;
    }
  });

  return throttled;
}

export function usePrevious<T>(source: () => T): () => T | undefined {
  const prev = signal<T | undefined>(undefined);
  const current = { value: undefined as T | undefined };

  effect(() => {
    const value = source();
    prev.set(current.value);
    current.value = value;
  });

  return prev;
}

export function useToggle(initial = false): [() => boolean, () => void, (value: boolean) => void] {
  const value = signal(initial);
  return [value, () => value.update((v) => !v), (next: boolean) => value.set(next)];
}

export function useCounter(initial = 0): {
  count: () => number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
  set: (value: number) => void;
} {
  const count = signal(initial);

  return {
    count,
    increment: () => count.update((c) => c + 1),
    decrement: () => count.update((c) => c - 1),
    reset: () => count.set(initial),
    set: (next: number) => count.set(next),
  };
}

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

  const value = signal(initial);

  effect(() => {
    localStorage.setItem(key, JSON.stringify(value()));
  });

  return [value, (next: T) => value.set(next)];
}

export function useMediaQuery(query: string): () => boolean {
  const matches = signal(false);

  effect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(query);
    matches.set(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => matches.set(e.matches);
    mediaQuery.addEventListener("change", handler);

    return () => mediaQuery.removeEventListener("change", handler);
  });

  return matches;
}

export function useWindowSize(): { width: () => number; height: () => number } {
  const width = signal(typeof window !== "undefined" ? window.innerWidth : 0);
  const height = signal(typeof window !== "undefined" ? window.innerHeight : 0);

  effect(() => {
    if (typeof window === "undefined") return undefined;

    const handler = () => {
      width.set(window.innerWidth);
      height.set(window.innerHeight);
    };
    window.addEventListener("resize", handler);

    return () => window.removeEventListener("resize", handler);
  });

  return { width, height };
}

export function useIntersection(
  ref: { current: Element | null } | (() => Element | null),
  options?: IntersectionObserverInit,
): () => boolean {
  const isIntersecting = signal(false);
  const mounted = signal(false);
  let observer: IntersectionObserver | null = null;

  onMount(() => mounted.set(true));

  effect(() => {
    // Read, not ignored: the ref is filled after mount, so this is the
    // dependency that re-runs the effect once the element exists.
    mounted();

    const element = typeof ref === "function" ? ref() : ref.current;
    if (!element) return undefined;

    observer = new IntersectionObserver(([entry]) => {
      isIntersecting.set(entry.isIntersecting);
    }, options);

    observer.observe(element);

    return () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    };
  });

  return isIntersecting;
}

export function useClickOutside(
  ref: { current: Element | null } | (() => Element | null),
  handler: () => void,
): void {
  effect(() => {
    const listener = (event: Event) => {
      const element = typeof ref === "function" ? ref() : ref.current;
      const target = event.target;
      if (!element || (target instanceof Node && element.contains(target))) {
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

export function useKeyboard(
  key: string,
  handler: (e: KeyboardEvent) => void,
  options?: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean },
): void {
  effect(() => {
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

export function useTitle(title: string | (() => string)): void {
  effect(() => {
    const t = typeof title === "function" ? title() : title;
    document.title = t;
  });
}

export function useInterval(
  callback: () => void,
  delay: number | null | (() => number | null),
): void {
  // A ref, so a re-render does not restart the timer with a stale callback.
  let savedCallback = callback;

  effect(() => {
    savedCallback = callback;
  });

  effect(() => {
    const d = typeof delay === "function" ? delay() : delay;
    if (d === null) return undefined;

    const id = setInterval(() => savedCallback(), d);
    return () => clearInterval(id);
  });
}

export function useTimeout(
  callback: () => void,
  delay: number | null | (() => number | null),
): void {
  // A ref, so a re-render does not restart the timer with a stale callback.
  let savedCallback = callback;

  effect(() => {
    savedCallback = callback;
  });

  effect(() => {
    const d = typeof delay === "function" ? delay() : delay;
    if (d === null) return undefined;

    const id = setTimeout(() => savedCallback(), d);
    return () => clearTimeout(id);
  });
}
