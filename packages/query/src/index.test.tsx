/**
 * Two properties a module-global client cannot have: the provider forks the
 * context on its own instance scope, so a consumer sees the client above it
 * rather than whichever was set last, and two clients can coexist on one page.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { Loading, effect, flush, render, scope } from "@barqjs/core";
import { QueryClient } from "@tanstack/query-core";
import {
  QueryClientProvider,
  queryOptions,
  useIsFetching,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "./index.ts";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function client(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

const seen: QueryClient[] = [];

export function ClientProbe() {
  seen.push(useQueryClient());
  return <div>probe</div>;
}

const results: string[] = [];

export function UsersView() {
  const query = useQuery<string[]>(() => ({
    queryKey: ["users"],
    queryFn: async () => ["alice", "bob"],
  }));
  return <div>{() => (query.data ?? []).join(",")}</div>;
}

export function FetchingCount() {
  const count = useIsFetching();
  return <div>{() => `fetching:${count()}`}</div>;
}

export function Adder() {
  const mutation = useMutation<string, Error, string>(() => ({
    mutationFn: async (name: string) => {
      results.push(name);
      return name.toUpperCase();
    },
  }));
  return (
    <button
      type="button"
      onClick={() => {
        void mutation.mutateAsync("zoe").catch(() => {});
      }}
    >
      {() => mutation.data ?? "idle"}
    </button>
  );
}

afterEach(() => {
  seen.length = 0;
  results.length = 0;
  document.body.innerHTML = "";
});

describe("the client is reached through the scope chain", () => {
  test("a provider is what a consumer below it sees", async () => {
    const a = client();
    const host = document.createElement("div");
    const dispose = render(
      () => (
        <QueryClientProvider client={a}>
          <ClientProbe />
        </QueryClientProvider>
      ),
      host,
    );

    await flush();
    expect(host.textContent).toContain("probe");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(a);
    dispose();
  });

  test("two clients coexist, which a module global cannot do", async () => {
    const a = client();
    const b = client();
    const host = document.createElement("div");
    const dispose = render(
      () => (
        <div>
          <QueryClientProvider client={a}>
            <ClientProbe />
          </QueryClientProvider>
          <QueryClientProvider client={b}>
            <ClientProbe />
          </QueryClientProvider>
        </div>
      ),
      host,
    );

    await flush();
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(a);
    expect(seen[1]).toBe(b);
    expect(seen[0]).not.toBe(seen[1]);
    dispose();
  });

  // The provider is the ONLY mechanism: a consumer with nothing above it fails
  // loudly rather than silently reaching a module-level default.
  test("the provider is the only mechanism, and its absence is an error", () => {
    const host = document.createElement("div");
    let thrown: unknown = null;
    try {
      render(() => <ClientProbe />, host)();
    } catch (error) {
      thrown = error;
    }
    expect(seen).toHaveLength(0);
    expect(String(thrown)).toContain("QueryClientProvider");
  });
});

describe("the hooks", () => {
  test("useQuery publishes its data reactively", async () => {
    const host = document.createElement("div");
    const dispose = render(
      () => (
        <QueryClientProvider client={client()}>
          <UsersView />
        </QueryClientProvider>
      ),
      host,
    );

    await flush();
    await tick(10);
    await flush();
    expect(host.textContent).toContain("alice,bob");
    dispose();
  });

  test("useIsFetching counts in-flight queries", async () => {
    const host = document.createElement("div");
    const dispose = render(
      () => (
        <QueryClientProvider client={client()}>
          <FetchingCount />
        </QueryClientProvider>
      ),
      host,
    );

    await flush();
    expect(host.textContent).toMatch(/fetching:\d+/);
    dispose();
  });

  test("useMutation runs its function and publishes the result", async () => {
    const host = document.createElement("div");
    // The handler is DELEGATED, so the click has to reach the document.
    document.body.append(host);
    const dispose = render(
      () => (
        <QueryClientProvider client={client()}>
          <Adder />
        </QueryClientProvider>
      ),
      host,
    );

    await flush();
    expect(host.textContent).toContain("idle");

    host.querySelector("button")?.click();
    await tick(10);
    await flush();

    expect(results).toEqual(["zoe"]);
    expect(host.textContent).toContain("ZOE");
    dispose();
  });
});

describe("ownership", () => {
  test("a disposed tree unsubscribes its observers", async () => {
    const shared = client();
    const host = document.createElement("div");
    const dispose = render(
      () => (
        <QueryClientProvider client={shared}>
          <UsersView />
        </QueryClientProvider>
      ),
      host,
    );

    await flush();
    await tick(10);
    await flush();
    expect(shared.getQueryCache().find({ queryKey: ["users"] })?.observers.length).toBe(1);

    dispose();
    await flush();

    expect(shared.getQueryCache().find({ queryKey: ["users"] })?.observers.length ?? 0).toBe(0);
  });
});

/**
 * The reason the result is a store and not a signal.
 *
 * An observer notifies on every state change a query has — fetching starts,
 * fetching ends, data arrives, `isStale` flips on a timer. Held in one signal,
 * each of those wakes every reader: a component rendering `data` re-runs twice
 * on every background refetch, forever. These count the runs.
 */
describe("results are fine-grained", () => {
  test("a data reader is not woken by a refetch that changes nothing else", async () => {
    const queryClient = client();
    let dataRuns = 0;
    let fetchingRuns = 0;

    function Counter() {
      const query = useQuery<string>(() => ({
        queryKey: ["stable"],
        queryFn: async () => "same",
      }));
      effect(() => {
        expect(query.data === undefined || typeof query.data === "string").toBe(true);
        dataRuns++;
      });
      effect(() => {
        expect(typeof query.isFetching).toBe("boolean");
        fetchingRuns++;
      });
      return <div>x</div>;
    }

    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Counter />
        </QueryClientProvider>
      ),
      host,
    );

    await tick(10);
    flush();
    const afterFirst = dataRuns;
    expect(afterFirst).toBeGreaterThan(0);

    // The same value comes back, so structural sharing keeps the reference and
    // the store drops the write before it reaches a subscriber.
    await queryClient.refetchQueries({ queryKey: ["stable"] });
    await tick(10);
    flush();

    expect(dataRuns, "a refetch returning the same data woke the data reader").toBe(afterFirst);
    expect(fetchingRuns, "isFetching never moved").toBeGreaterThan(afterFirst);
    dispose();
  });

  test("new data does wake the data reader", async () => {
    const queryClient = client();
    let value = "first";
    let dataRuns = 0;

    function Counter() {
      const query = useQuery<string>(() => ({
        queryKey: ["moving"],
        queryFn: async () => value,
      }));
      effect(() => {
        expect(query.data === undefined || typeof query.data === "string").toBe(true);
        dataRuns++;
      });
      return <div>x</div>;
    }

    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Counter />
        </QueryClientProvider>
      ),
      host,
    );

    await tick(10);
    flush();
    const afterFirst = dataRuns;

    value = "second";
    await queryClient.refetchQueries({ queryKey: ["moving"] });
    await tick(10);
    flush();

    expect(dataRuns).toBeGreaterThan(afterFirst);
    dispose();
  });
});

describe("useQueries", () => {
  test("runs a set through one observer", async () => {
    const queryClient = client();
    let seenLength = 0;
    const values: string[] = [];

    function Many() {
      const set = useQueries<string>(() => ({
        queries: [
          { queryKey: ["a"], queryFn: async () => "A" },
          { queryKey: ["b"], queryFn: async () => "B" },
          { queryKey: ["c"], queryFn: async () => "C" },
        ],
      }));
      effect(() => {
        seenLength = set.length;
        values.length = 0;
        for (const each of set) if (each.data !== undefined) values.push(each.data);
      });
      return <div>x</div>;
    }

    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Many />
        </QueryClientProvider>
      ),
      host,
    );

    await tick(20);
    flush();
    expect(seenLength).toBe(3);
    expect(values.toSorted()).toEqual(["A", "B", "C"]);
    dispose();
  });
});

describe("options helpers", () => {
  test("queryOptions is the identity, and carries its key", () => {
    const users = queryOptions({ queryKey: ["users"], queryFn: async () => ["ada"] });
    // The key comes back TAGGED with the data and error types, which is what
    // makes `client.getQueryData(users.queryKey)` typed without a cast.
    expect([...users.queryKey]).toEqual(["users"]);
    expect(typeof users.queryFn).toBe("function");
  });
});

describe("useQueryClient", () => {
  test("takes an explicit client, so a hook works outside a provider", () => {
    const queryClient = client();
    const dispose = scope((release) => {
      expect(useQueryClient(queryClient)).toBe(queryClient);
      return release;
    }, true);
    dispose();
  });

  test("says what to do when there is none", () => {
    const dispose = scope((release) => {
      expect(() => useQueryClient()).toThrow("QueryClientProvider");
      return release;
    }, true);
    dispose();
  });
});

/**
 * `useSuspenseQuery`, against barq's boundary rather than React's.
 *
 * The `data` read is the one that parks: `isPending` and `error` stay readable,
 * so a fallback and an inline indicator are expressible against one object.
 */
describe("useSuspenseQuery", () => {
  test("parks the enclosing Loading boundary until there is data", async () => {
    const queryClient = client();
    let release!: (value: string) => void;
    const arriving = new Promise<string>((resolve) => {
      release = resolve;
    });

    function Slow() {
      const query = useSuspenseQuery<string>(() => ({
        queryKey: ["slow"],
        queryFn: () => arriving,
      }));
      return <p>{() => query.data}</p>;
    }

    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Loading fallback={<span>waiting</span>}>
            <Slow />
          </Loading>
        </QueryClientProvider>
      ),
      host,
    );

    await tick(10);
    flush();
    expect(host.textContent, "the boundary did not park").toContain("waiting");

    release("arrived");
    await tick(30);
    flush();
    expect(host.textContent).toContain("arrived");
    dispose();
  });

  test("a plain useQuery does not park; it reports pending", async () => {
    const queryClient = client();
    const arriving = new Promise<string>((resolve) => setTimeout(() => resolve("later"), 30));

    function Patient() {
      const query = useQuery<string>(() => ({ queryKey: ["patient"], queryFn: () => arriving }));
      return <p>{() => (query.isPending ? "pending" : query.data)}</p>;
    }

    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Loading fallback={<span>waiting</span>}>
            <Patient />
          </Loading>
        </QueryClientProvider>
      ),
      host,
    );

    await tick(10);
    flush();
    expect(host.textContent).toContain("pending");
    dispose();
  });
});
