import {
  NotReadyError,
  createEffect,
  createMemo,
  createRoot,
  isServer,
  onCleanup,
  runWithOwner,
  untrack,
} from "@barqjs/core";
import { type DehydratedState, type QueryClient, dehydrate, hydrate } from "@tanstack/query-core";

/** What crosses from a server render to the page: the queries one read asked for. */
export type Seed = DehydratedState["queries"];

export interface FirstAnswer {
  /** A server's answer was on the page, and the cache holds it now. */
  readonly seeded: boolean;
  /** A server's answer is still on its way down the stream. */
  readonly arriving: boolean;
  /**
   * The seed, parking the reader until it is known and throwing what the
   * server's fetch threw. `undefined` when no server answered.
   */
  read(): Seed | undefined;
  /** Run `fn` once an arriving answer has landed, or has been given up on. */
  landed(fn: (seed: Seed | undefined) => void): void;
}

const CARRIED = new WeakMap<QueryClient, Set<string>>();

/**
 * The queries an application is already carrying to the page itself, by hash.
 *
 * A `HydrationBoundary` is handed state the application serialises, so a read
 * below it that seeded the same query would send it twice.
 */
export function carried(client: QueryClient): Set<string> {
  let hashes = CARRIED.get(client);
  if (hashes === undefined) {
    hashes = new Set();
    CARRIED.set(client, hashes);
  }
  return hashes;
}

const READ = new WeakMap<QueryClient, Set<string>>();

/**
 * The queries a read on this render is carrying to the page, by hash.
 *
 * Whatever else carries a client's cache across, the router integration for
 * one, leaves these out: the read that seeded one is also what tells the
 * browser's observer not to fetch it again on mounting.
 */
export function seededByRead(client: QueryClient): Set<string> {
  let hashes = READ.get(client);
  if (hashes === undefined) {
    hashes = new Set();
    READ.set(client, hashes);
  }
  return hashes;
}

function dehydrated(client: QueryClient, hashes: readonly string[]): Seed {
  return dehydrate(client, {
    shouldDehydrateQuery: (query) =>
      query.state.status === "success" && hashes.includes(query.queryHash),
    shouldDehydrateMutation: () => false,
  }).queries;
}

/**
 * A read's first answer, as a value that crosses a server render.
 *
 * On the server `flight` starts the fetches and names the queries to send; the
 * memo below is what a `Loading` boundary parks on, what `renderPage` waits
 * for, and what the seed payload records. On the client the same declaration
 * finds that record instead of running, already settled on a buffered page and
 * as a promise on a streamed one.
 *
 * The memo is declared on both sides whether or not anything crosses, because
 * a seed is found by the position of its declaration: a side that skipped it
 * would move every async value declared afterwards.
 */
export function firstAnswer(
  client: QueryClient,
  name: string,
  flight: () => Promise<readonly string[]> | undefined,
): FirstAnswer {
  let asked = false;
  const memo = createMemo<Seed | undefined>(
    () => {
      asked = true;
      if (!isServer) return undefined;
      const flying = flight();
      if (flying === undefined) return undefined;
      return flying.then((hashes) => dehydrated(client, hashes));
    },
    { name },
  );

  let seed: Seed | undefined;
  let arriving = false;
  if (!asked) {
    // Outside every owner: a pending read made under the component being built
    // would park that component on a value it has not asked to wait for.
    runWithOwner(null, () => {
      try {
        seed = untrack(memo);
      } catch (error) {
        if (!(error instanceof NotReadyError)) throw error;
        arriving = true;
      }
    });
  }

  let absorbed = false;
  const absorb = (value: Seed | undefined): void => {
    if (absorbed) return;
    absorbed = true;
    if (value !== undefined) hydrate(client, { mutations: [], queries: value });
  };
  if (!asked && !arriving) absorb(seed);

  return {
    seeded: seed !== undefined,
    arriving,
    read() {
      const value = memo();
      absorb(value);
      return value;
    },
    landed(fn) {
      if (!arriving || isServer) return;
      const stop = runWithOwner(null, () =>
        createRoot((dispose) => {
          createEffect(memo, {
            effect: (value) => {
              absorb(value);
              fn(value);
            },
            // The server's fetch failed after the shell had gone. The readers
            // parked on it are thrown that error; this side fetches for itself.
            error: () => {
              absorbed = true;
              fn(undefined);
            },
          });
          return dispose;
        }),
      );
      onCleanup(stop);
    },
  };
}
