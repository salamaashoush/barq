/**
 * An `IntersectionObserver` a test drives by hand.
 *
 * happy-dom has no layout, so nothing ever intersects anything. A test of a
 * load-more sentinel needs to say "the sentinel came into reach" itself, and
 * to see which observers are still connected after the collection changed.
 */

interface Observed {
  callback: IntersectionObserverCallback;
  targets: Element[];
}

export interface Intersections {
  /** The observers still watching something. */
  live(): Observed[];
  /** Report the most recent live observer's sentinel as in reach. */
  fire(): void;
  restore(): void;
}

export function stubIntersections(): Intersections {
  const real = globalThis.IntersectionObserver;
  const observers: Observed[] = [];
  globalThis.IntersectionObserver = class {
    readonly targets: Element[] = [];
    constructor(callback: IntersectionObserverCallback) {
      observers.push({ callback, targets: this.targets });
    }
    observe(target: Element): void {
      this.targets.push(target);
    }
    disconnect(): void {
      this.targets.length = 0;
    }
    unobserve(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;

  function live(): Observed[] {
    return observers.filter((observer) => observer.targets.length > 0);
  }
  return {
    live,
    fire: () => {
      live()
        .at(-1)
        ?.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
    },
    restore: () => {
      globalThis.IntersectionObserver = real;
    },
  };
}
