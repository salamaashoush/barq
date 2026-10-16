/**
 * The adapter against the behaviours TanStack Query documents: each test is one
 * of them, mounted the way an application mounts it, with the cache events a
 * browser would produce.
 */

import { afterEach, describe, expect, jest, test } from "bun:test";
import { Errored, Loading, createSignal, flush, render } from "@barqjs/core";
import {
  type InfiniteData,
  QueryClient,
  QueryClientProvider,
  QueryErrorResetBoundary,
  focusManager,
  keepPreviousData,
  onlineManager,
  queryOptions,
  skipToken,
  useInfiniteQuery,
  useIsFetching,
  useIsMutating,
  useMutation,
  useMutationState,
  usePrefetchInfiniteQuery,
  usePrefetchQuery,
  useQueries,
  useQuery,
  useQueryClient,
  useQueryErrorResetBoundary,
  useSuspenseQueries,
  useSuspenseQuery,
} from "./index.ts";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// `setImmediate` is the one timer fake timers leave real, and it fires once the
// microtask queue is empty.
async function drain(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  flush();
}

async function settled(ms = 10): Promise<void> {
  await tick(ms);
  flush();
}

function client(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
}

function host(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

afterEach(() => {
  document.body.innerHTML = "";
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

describe("useInfiniteQuery", () => {
  test("pages in both directions", async () => {
    const queryClient = client();
    let pages!: ReturnType<typeof useInfiniteQuery<number, Error, InfiniteData<number>>>;

    function Feed() {
      pages = useInfiniteQuery(() => ({
        queryKey: ["feed"],
        queryFn: async ({ pageParam }) => pageParam,
        initialPageParam: 10,
        getNextPageParam: (last) => last + 1,
        getPreviousPageParam: (first) => first - 1,
      }));
      return <p>{() => pages.data?.pages.join(",")}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Feed />
        </QueryClientProvider>
      ),
      element,
    );

    await settled();
    expect(element.textContent).toBe("10");
    expect(pages.hasNextPage).toBe(true);
    expect(pages.hasPreviousPage).toBe(true);

    await pages.fetchNextPage();
    await settled();
    expect(element.textContent).toBe("10,11");

    await pages.fetchPreviousPage();
    await settled();
    expect(element.textContent).toBe("9,10,11");
    expect(pages.data?.pageParams).toEqual([9, 10, 11]);
    dispose();
  });

  test("maxPages drops the far end as the window moves", async () => {
    const queryClient = client();
    let pages!: ReturnType<typeof useInfiniteQuery<number, Error, InfiniteData<number>>>;

    function Windowed() {
      pages = useInfiniteQuery(() => ({
        queryKey: ["windowed"],
        queryFn: async ({ pageParam }) => pageParam,
        initialPageParam: 0,
        getNextPageParam: (last) => last + 1,
        getPreviousPageParam: (first) => first - 1,
        maxPages: 2,
      }));
      return <p>{() => pages.data?.pages.join(",")}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Windowed />
        </QueryClientProvider>
      ),
      element,
    );

    await settled();
    await pages.fetchNextPage();
    await pages.fetchNextPage();
    await settled();
    expect(element.textContent).toBe("1,2");

    await pages.fetchPreviousPage();
    await settled();
    expect(element.textContent).toBe("0,1");
    dispose();
  });
});

describe("mutations", () => {
  test("mutate passes its per-call callbacks through", async () => {
    const queryClient = client();
    const calls: string[] = [];
    let save!: ReturnType<typeof useMutation<string, Error, string>>;

    function Saver() {
      save = useMutation<string, Error, string>(() => ({
        mutationFn: async (name) => {
          if (name === "bad") throw new Error("refused");
          return name.toUpperCase();
        },
        onSuccess: (data) => {
          calls.push(`hook:${data}`);
        },
      }));
      return <p>{() => save.status}</p>;
    }

    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Saver />
        </QueryClientProvider>
      ),
      host(),
    );
    await settled();

    save.mutate("salama", {
      onSuccess: (data, variables) => calls.push(`call:${data}:${variables}`),
      onSettled: (data, error) => calls.push(`settled:${data}:${error === null}`),
    });
    await settled();
    expect(calls).toEqual(["hook:SALAMA", "call:SALAMA:salama", "settled:SALAMA:true"]);

    calls.length = 0;
    save.mutate("bad", {
      onError: (error) => calls.push(`error:${error.message}`),
      onSettled: (data, error) => calls.push(`settled:${data}:${error?.message}`),
    });
    await settled();
    expect(calls).toEqual(["error:refused", "settled:undefined:refused"]);
    expect(save.isError).toBe(true);

    const direct = await save.mutateAsync("again", { onSuccess: () => calls.push("async") });
    expect(direct).toBe("AGAIN");
    expect(calls).toContain("async");
    dispose();
  });

  test("an optimistic update is rolled back when the mutation fails", async () => {
    const queryClient = client();
    queryClient.setQueryData(["todos"], ["first"]);
    let add!: ReturnType<typeof useMutation<string, Error, string, { previous: string[] }>>;
    let release!: (fail: boolean) => void;

    function Todos() {
      const todos = useQuery<string[]>(() => ({
        queryKey: ["todos"],
        queryFn: async () => ["first"],
        staleTime: Infinity,
      }));
      add = useMutation<string, Error, string, { previous: string[] }>(() => ({
        mutationFn: (text) =>
          new Promise<string>((resolve, reject) => {
            release = (fail) => (fail ? reject(new Error("offline")) : resolve(text));
          }),
        onMutate: async (text) => {
          await queryClient.cancelQueries({ queryKey: ["todos"] });
          const previous = queryClient.getQueryData<string[]>(["todos"]) ?? [];
          queryClient.setQueryData<string[]>(["todos"], [...previous, text]);
          return { previous };
        },
        onError: (_error, _text, context) => {
          queryClient.setQueryData(["todos"], context?.previous);
        },
      }));
      return <p>{() => (todos.data ?? []).join(",")}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Todos />
        </QueryClientProvider>
      ),
      element,
    );
    await settled();
    expect(element.textContent).toBe("first");

    add.mutate("second");
    await settled();
    expect(element.textContent).toBe("first,second");

    release(true);
    await settled();
    expect(element.textContent).toBe("first");
    expect(add.error?.message).toBe("offline");
    dispose();
  });

  test("useIsMutating and useMutationState follow the cache, and their filters", async () => {
    const queryClient = client();
    const [key, setKey] = createSignal("a");
    const releases: (() => void)[] = [];
    let run!: (which: string) => void;

    function Watcher() {
      const a = useMutation<string, Error, string>(() => ({
        mutationKey: ["a"],
        mutationFn: (value) => new Promise((resolve) => releases.push(() => resolve(value))),
      }));
      const b = useMutation<string, Error, string>(() => ({
        mutationKey: ["b"],
        mutationFn: (value) => new Promise((resolve) => releases.push(() => resolve(value))),
      }));
      run = (which) => (which === "a" ? a : b).mutate(`${which}-value`);

      const all = useIsMutating();
      const keyed = useIsMutating(() => ({ mutationKey: [key()] }));
      const fixed = useIsMutating({ mutationKey: ["b"] });
      const variables = useMutationState(() => ({
        filters: { mutationKey: [key()], status: "pending" },
        select: (mutation) => mutation.state.variables as string,
      }));
      const done = useMutationState<string>({
        filters: { status: "success" },
        select: (mutation) => mutation.state.data as string,
      });
      return (
        <p>
          {() => `${all()}/${keyed()}/${fixed()}`} {() => `[${variables().join(",")}]`}{" "}
          {() => `(${done().join(",")})`}
        </p>
      );
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Watcher />
        </QueryClientProvider>
      ),
      element,
    );
    await settled();
    expect(element.textContent).toBe("0/0/0 [] ()");

    run("a");
    run("b");
    await settled();
    expect(element.textContent).toBe("2/1/1 [a-value] ()");

    setKey("b");
    await settled();
    expect(element.textContent).toBe("2/1/1 [b-value] ()");

    releases[0]?.();
    await settled();
    expect(element.textContent).toBe("1/1/1 [b-value] (a-value)");

    releases[1]?.();
    await settled();
    expect(element.textContent).toBe("0/0/0 [] (a-value,b-value)");
    dispose();
  });
});

describe("query options", () => {
  test("select transforms what the component sees, not what the cache holds", async () => {
    const queryClient = client();

    function Count() {
      const query = useQuery(() => ({
        queryKey: ["names"],
        queryFn: async () => ["salama", "guest"],
        select: (names: string[]) => names.length,
      }));
      return <p>{() => String(query.data)}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Count />
        </QueryClientProvider>
      ),
      element,
    );
    await settled();
    expect(element.textContent).toBe("2");
    const held: unknown = queryClient.getQueryData(["names"]);
    expect(held).toEqual(["salama", "guest"]);
    dispose();
  });

  test("enabled holds a query back until it turns true", async () => {
    const queryClient = client();
    const [on, setOn] = createSignal(false);
    let fetches = 0;

    function Gated() {
      const query = useQuery(() => ({
        queryKey: ["gated"],
        queryFn: async () => {
          fetches++;
          return "open";
        },
        enabled: on(),
      }));
      return <p>{() => `${query.fetchStatus}:${query.data}`}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Gated />
        </QueryClientProvider>
      ),
      element,
    );
    await settled();
    expect(fetches).toBe(0);
    expect(element.textContent).toBe("idle:undefined");

    setOn(true);
    await settled();
    expect(fetches).toBe(1);
    expect(element.textContent).toBe("idle:open");
    dispose();
  });

  test("skipToken is a query function that never runs", async () => {
    const queryClient = client();
    const [id, setId] = createSignal<number | undefined>(undefined);
    let fetches = 0;

    function Skipped() {
      const query = useQuery(() => ({
        queryKey: ["user", id()],
        queryFn:
          id() === undefined
            ? skipToken
            : async () => {
                fetches++;
                return `user-${id()}`;
              },
      }));
      return <p>{() => `${query.status}:${query.data}`}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Skipped />
        </QueryClientProvider>
      ),
      element,
    );
    await settled();
    expect(fetches).toBe(0);
    expect(element.textContent).toBe("pending:undefined");

    setId(7);
    await settled();
    expect(fetches).toBe(1);
    expect(element.textContent).toBe("success:user-7");
    dispose();
  });

  test("placeholderData: keepPreviousData shows the last key's data while the next loads", async () => {
    const queryClient = client();
    const [page, setPage] = createSignal(1);
    const seen: string[] = [];

    function Paged() {
      const query = useQuery(() => ({
        queryKey: ["page", page()],
        queryFn: async () => {
          await tick(15);
          return `page-${page()}`;
        },
        placeholderData: keepPreviousData,
      }));
      return (
        <p>
          {() => {
            const shown = `${query.data}:${query.isPlaceholderData}`;
            seen.push(shown);
            return shown;
          }}
        </p>
      );
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Paged />
        </QueryClientProvider>
      ),
      element,
    );
    await settled(40);
    expect(element.textContent).toBe("page-1:false");
    seen.length = 0;

    setPage(2);
    await settled(5);
    expect(element.textContent).toBe("page-1:true");

    await settled(40);
    expect(element.textContent).toBe("page-2:false");
    expect(seen).toEqual(["page-1:true", "page-2:false"]);
    dispose();
  });

  test("refetchInterval polls", async () => {
    // happy-dom folds every zero-delay timeout into one native timer. One an
    // earlier test left pending on the real clock would collect the notify
    // manager's timeouts too, where the fake clock never reaches them, so it
    // is let fire first.
    await tick(0);
    jest.useFakeTimers();
    try {
      const queryClient = client();
      let fetches = 0;

      function Polled() {
        const query = useQuery(() => ({
          queryKey: ["polled"],
          queryFn: async () => ++fetches,
          refetchInterval: 15,
        }));
        return <p>{() => String(query.data)}</p>;
      }

      const element = host();
      const dispose = render(
        () => (
          <QueryClientProvider client={queryClient}>
            <Polled />
          </QueryClientProvider>
        ),
        element,
      );
      await drain();
      expect(fetches).toBe(1);
      jest.advanceTimersByTime(14);
      await drain();
      expect(fetches, "a millisecond before the interval").toBe(1);
      jest.advanceTimersByTime(1);
      await drain();
      expect(fetches).toBe(2);
      jest.advanceTimersByTime(15);
      await drain();
      expect(fetches).toBe(3);
      jest.advanceTimersByTime(0);
      await drain();
      expect(element.textContent).toBe("3");

      dispose();
      jest.advanceTimersByTime(50);
      await drain();
      expect(fetches).toBe(3);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a stale query refetches when the window regains focus, and when the network returns", async () => {
    const queryClient = client();
    let fetches = 0;

    function Watched() {
      const query = useQuery(() => ({
        queryKey: ["watched"],
        queryFn: async () => ++fetches,
      }));
      return <p>{() => String(query.data)}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Watched />
        </QueryClientProvider>
      ),
      element,
    );
    await settled();
    expect(fetches).toBe(1);

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await settled();
    expect(fetches).toBe(2);
    expect(element.textContent).toBe("2");

    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await settled();
    expect(fetches).toBe(3);
    expect(element.textContent).toBe("3");
    dispose();
  });

  test("cancelling a query aborts the signal its function was handed", async () => {
    const queryClient = client();
    let aborted = false;

    function Slow() {
      const query = useQuery(() => ({
        queryKey: ["slow"],
        queryFn: ({ signal }) =>
          new Promise<string>((resolve) => {
            signal.addEventListener("abort", () => {
              aborted = true;
            });
            setTimeout(() => resolve("late"), 200);
          }),
      }));
      return <p>{() => `${query.fetchStatus}:${query.data}`}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Slow />
        </QueryClientProvider>
      ),
      element,
    );
    await settled();
    expect(element.textContent).toBe("fetching:undefined");

    await queryClient.cancelQueries({ queryKey: ["slow"] });
    await settled();
    expect(aborted).toBe(true);
    expect(element.textContent).toBe("idle:undefined");
    dispose();
  });
});

describe("errors", () => {
  test("throwOnError hands the error to the enclosing Errored boundary", async () => {
    const queryClient = client();

    function Failing() {
      const query = useQuery<string>(() => ({
        queryKey: ["failing"],
        queryFn: async () => {
          throw new Error("no such user");
        },
        throwOnError: true,
      }));
      return <p>{() => query.data ?? "no data"}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Errored fallback={(error: () => Error) => <b>caught: {error().message}</b>}>
            <Failing />
          </Errored>
        </QueryClientProvider>
      ),
      element,
    );
    await settled(20);
    expect(element.textContent).toBe("caught: no such user");
    dispose();
  });

  test("without throwOnError the error stays on the result", async () => {
    const queryClient = client();

    function Reporting() {
      const query = useQuery<string>(() => ({
        queryKey: ["reporting"],
        queryFn: async () => {
          throw new Error("quiet");
        },
      }));
      return <p>{() => (query.isError ? `error: ${query.error.message}` : "fine")}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Errored fallback={() => <b>caught</b>}>
            <Reporting />
          </Errored>
        </QueryClientProvider>
      ),
      element,
    );
    await settled(20);
    expect(element.textContent).toBe("error: quiet");
    dispose();
  });

  test("a boundary's reset refetches only after QueryErrorResetBoundary's reset", async () => {
    const queryClient = client();
    let fetches = 0;
    let healthy = false;
    let boundary!: ReturnType<typeof useQueryErrorResetBoundary>;
    let rebuild!: () => void;

    function Flaky() {
      const query = useQuery<string>(() => ({
        queryKey: ["flaky"],
        queryFn: async () => {
          fetches++;
          if (!healthy) throw new Error("down");
          return "up";
        },
        throwOnError: true,
      }));
      return <p>{() => query.data ?? "waiting"}</p>;
    }

    function Guarded() {
      boundary = useQueryErrorResetBoundary();
      return (
        <Errored
          fallback={(error: () => Error, reset: () => void) => {
            rebuild = reset;
            return <b>{error().message}</b>;
          }}
        >
          <Flaky />
        </Errored>
      );
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <QueryErrorResetBoundary>
            <Guarded />
          </QueryErrorResetBoundary>
        </QueryClientProvider>
      ),
      element,
    );
    await settled(20);
    expect(element.textContent).toBe("down");
    expect(fetches).toBe(1);

    healthy = true;
    rebuild();
    await settled(20);
    expect(fetches, "the boundary's reset alone must not refetch a failed query").toBe(1);
    expect(element.textContent).toBe("down");

    boundary.reset();
    rebuild();
    await settled(20);
    expect(fetches).toBe(2);
    expect(element.textContent).toBe("up");
    expect(boundary.isReset()).toBe(false);
    dispose();
  });

  test("a suspense query with nothing to show throws to the boundary", async () => {
    const queryClient = client();

    function Parked() {
      const query = useSuspenseQuery<string>(() => ({
        queryKey: ["parked-failure"],
        queryFn: async () => {
          throw new Error("never arrived");
        },
      }));
      return <p>{() => query.data}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Errored fallback={(error: () => Error) => <b>{error().message}</b>}>
            <Loading fallback={<i>waiting</i>}>
              <Parked />
            </Loading>
          </Errored>
        </QueryClientProvider>
      ),
      element,
    );
    await settled(20);
    expect(element.textContent).toBe("never arrived");
    dispose();
  });
});

describe("prefetching", () => {
  test("usePrefetchQuery starts the fetch without observing it", async () => {
    const queryClient = client();
    let fetches = 0;
    const users = queryOptions({
      queryKey: ["prefetched"],
      queryFn: async () => {
        fetches++;
        return ["salama"];
      },
      staleTime: Infinity,
      gcTime: 60_000,
    });

    function Route() {
      usePrefetchQuery(() => users);
      return <p>route</p>;
    }
    function Reader() {
      const query = useQuery(() => users);
      return <p>{() => (query.data ?? []).join(",")}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Route />
        </QueryClientProvider>
      ),
      element,
    );
    await settled();
    expect(fetches).toBe(1);
    const prefetched: string[] | undefined = queryClient.getQueryData(users.queryKey);
    expect(prefetched).toEqual(["salama"]);
    expect(queryClient.getQueryCache().find({ queryKey: users.queryKey })?.observers.length).toBe(
      0,
    );
    dispose();

    const second = host();
    const disposeReader = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Reader />
        </QueryClientProvider>
      ),
      second,
    );
    await settled();
    expect(second.textContent).toBe("salama");
    expect(fetches).toBe(1);
    disposeReader();
  });

  test("usePrefetchInfiniteQuery fetches the first page", async () => {
    const queryClient = client();

    function Route() {
      usePrefetchInfiniteQuery(() => ({
        queryKey: ["prefetched-pages"],
        queryFn: async ({ pageParam }) => `page-${pageParam}`,
        initialPageParam: 0,
        gcTime: 60_000,
      }));
      return <p>route</p>;
    }

    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Route />
        </QueryClientProvider>
      ),
      host(),
    );
    await settled();
    const pages: unknown = queryClient.getQueryData(["prefetched-pages"]);
    expect(pages).toEqual({ pages: ["page-0"], pageParams: [0] });
    dispose();
  });
});

describe("useIsFetching", () => {
  test("counts by filter, static or reactive", async () => {
    const queryClient = client();
    const [key, setKey] = createSignal("a");
    const releases: (() => void)[] = [];

    function Busy() {
      useQuery(() => ({
        queryKey: ["a"],
        queryFn: () => new Promise<string>((resolve) => releases.push(() => resolve("a"))),
      }));
      useQuery(() => ({
        queryKey: ["b"],
        queryFn: () => new Promise<string>((resolve) => releases.push(() => resolve("b"))),
      }));
      const all = useIsFetching();
      const fixed = useIsFetching({ queryKey: ["a"] });
      const keyed = useIsFetching(() => ({ queryKey: [key()] }));
      return <p>{() => `${all()}/${fixed()}/${keyed()}`}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Busy />
        </QueryClientProvider>
      ),
      element,
    );
    await settled();
    expect(element.textContent).toBe("2/1/1");

    releases[0]?.();
    await settled();
    expect(element.textContent).toBe("1/0/0");

    setKey("b");
    await settled();
    expect(element.textContent).toBe("1/0/1");

    releases[1]?.();
    await settled();
    expect(element.textContent).toBe("0/0/0");
    dispose();
  });
});

describe("useQueries", () => {
  test("each member keeps its own type, and combine folds them into one object", async () => {
    const queryClient = client();
    let combineRuns = 0;
    let totalRuns = 0;

    function Dashboard() {
      const set = useQueries(() => ({
        queries: [
          { queryKey: ["count"], queryFn: async () => 2 },
          { queryKey: ["label"], queryFn: async () => "items" },
        ],
      }));
      const count: number | undefined = set[0].data;
      const label: string | undefined = set[1].data;
      expect([count, label]).toEqual([undefined, undefined]);

      const summary = useQueries(() => ({
        queries: [
          { queryKey: ["count"], queryFn: async () => 2 },
          { queryKey: ["label"], queryFn: async () => "items" },
        ],
        combine: (results) => {
          combineRuns++;
          return {
            pending: results.some((each) => each.isPending),
            text: `${results[0].data ?? "?"} ${results[1].data ?? "?"}`,
          };
        },
      }));
      return (
        <p>
          {() => `${set[0].data}/${set[1].data}`}{" "}
          {() => {
            totalRuns++;
            return summary.text;
          }}{" "}
          {() => String(summary.pending)}
        </p>
      );
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Dashboard />
        </QueryClientProvider>
      ),
      element,
    );
    expect(element.textContent).toBe("undefined/undefined ? ? true");
    await settled(20);
    expect(element.textContent).toBe("2/items 2 items false");
    expect(combineRuns).toBeGreaterThan(1);

    // The combined object is one store: a refetch that changes nothing leaves
    // the reader of `text` alone.
    const before = totalRuns;
    await queryClient.refetchQueries();
    await settled(20);
    expect(totalRuns).toBe(before);
    dispose();
  });

  test("combine has to return something with fields", () => {
    const queryClient = client();

    function Bare() {
      useQueries(() => ({
        queries: [{ queryKey: ["bare"], queryFn: async () => 1 }],
        combine: (results) => results.length,
      }));
      return <p>x</p>;
    }

    expect(() =>
      render(
        () => (
          <QueryClientProvider client={queryClient}>
            <Bare />
          </QueryClientProvider>
        ),
        host(),
      ),
    ).toThrow("`combine` has to return an object or an array");
  });

  test("the set follows a reactive list of queries", async () => {
    const queryClient = client();
    const [ids, setIds] = createSignal([1, 2]);

    function Users() {
      const set = useQueries(() => ({
        queries: ids().map((id) => ({
          queryKey: ["user", id],
          queryFn: async () => `user-${id}`,
        })),
      }));
      return <p>{() => set.map((each) => each.data).join(",")}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Users />
        </QueryClientProvider>
      ),
      element,
    );
    await settled(20);
    expect(element.textContent).toBe("user-1,user-2");

    setIds([2, 3, 4]);
    await settled(20);
    expect(element.textContent).toBe("user-2,user-3,user-4");
    dispose();
  });
});

describe("useQueries over queryOptions", () => {
  interface Member {
    readonly name: string;
  }
  const member = (id: string) =>
    queryOptions({
      queryKey: ["member", id],
      queryFn: async (): Promise<Member> => ({ name: id }),
    });

  test("a tuple and a mapped array of queryOptions keep data typed", async () => {
    const queryClient = client();

    function Team() {
      const pair = useQueries(() => ({ queries: [member("salama"), member("example.com")] }));
      const first: Member | undefined = pair[0].data;
      const second: Member | undefined = pair[1].data;
      expect([first, second]).toEqual([undefined, undefined]);

      const all = useQueries(() => ({ queries: ["salama", "example.com"].map(member) }));
      const each: (Member | undefined)[] = all.map((result) => result.data);
      expect(each).toEqual([undefined, undefined]);

      return <p>{() => all.map((result) => result.data?.name ?? "?").join(",")}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Team />
        </QueryClientProvider>
      ),
      element,
    );
    await settled(20);
    expect(element.textContent).toBe("salama,example.com");
    dispose();
  });

  test("useSuspenseQueries over queryOptions has data that is there", async () => {
    const queryClient = client();

    function Pair() {
      const [first, second] = useSuspenseQueries(() => ({
        queries: [member("salama"), member("example.com")],
      }));
      return <p>{() => `${first.data.name}+${second.data.name}`}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Loading fallback={<i>waiting</i>}>
            <Pair />
          </Loading>
        </QueryClientProvider>
      ),
      element,
    );
    await settled(20);
    expect(element.textContent).toBe("salama+example.com");
    dispose();
  });
});

describe("useSuspenseQueries", () => {
  test("parks until every member has data, while fetching them side by side", async () => {
    const queryClient = client();
    const started: string[] = [];
    const releases: Record<string, () => void> = {};
    const waiting = (name: string) => () => {
      started.push(name);
      return new Promise<string>((resolve) => {
        releases[name] = () => resolve(name.toUpperCase());
      });
    };

    function Pair() {
      const [first, second] = useSuspenseQueries(() => ({
        queries: [
          { queryKey: ["first"], queryFn: waiting("first") },
          { queryKey: ["second"], queryFn: waiting("second") },
        ],
      }));
      return <p>{() => `${first.data}+${second.data}`}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Loading fallback={<i>waiting</i>}>
            <Pair />
          </Loading>
        </QueryClientProvider>
      ),
      element,
    );
    await settled();
    expect(element.textContent).toBe("waiting");
    expect(started).toEqual(["first", "second"]);

    releases.first?.();
    await settled();
    expect(element.textContent).toBe("waiting");

    releases.second?.();
    await settled(20);
    expect(element.textContent).toBe("FIRST+SECOND");
    dispose();
  });

  test("combine runs once there is data to combine", async () => {
    const queryClient = client();
    const seen: unknown[][] = [];

    function Sum() {
      const total = useSuspenseQueries(() => ({
        queries: [
          { queryKey: ["one"], queryFn: async () => 1 },
          { queryKey: ["two"], queryFn: async () => 2 },
        ],
        combine: (results) => {
          seen.push(results.map((each) => each.data));
          return { sum: results[0].data + results[1].data };
        },
      }));
      return <p>{() => String(total.sum)}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Loading fallback={<i>waiting</i>}>
            <Sum />
          </Loading>
        </QueryClientProvider>
      ),
      element,
    );
    expect(element.textContent).toBe("waiting");
    await settled(20);
    expect(element.textContent).toBe("3");
    expect(seen.every((data) => data.every((value) => value !== undefined))).toBe(true);
    dispose();
  });
});

describe("typed options", () => {
  test("defined initialData makes data defined", async () => {
    const queryClient = client();
    const settings = queryOptions({
      queryKey: ["settings"],
      queryFn: async () => ({ theme: "dark" }),
      initialData: { theme: "light" },
      staleTime: Infinity,
    });

    function Theme() {
      const query = useQuery(() => settings);
      // No `?.`: the overload that matched says `data` is there.
      const theme: string = query.data.theme;
      return <p>{theme}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Theme />
        </QueryClientProvider>
      ),
      element,
    );
    await settled();
    expect(element.textContent).toBe("light");
    const cached: { theme: string } | undefined = queryClient.getQueryData(settings.queryKey);
    expect(cached).toEqual({ theme: "light" });
    dispose();
  });

  test("the client in scope is the one the hooks use", () => {
    const queryClient = client();
    let found: QueryClient | undefined;
    function Probe() {
      found = useQueryClient();
      return <p>x</p>;
    }
    render(
      () => (
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>
      ),
      host(),
    )();
    expect(found).toBe(queryClient);
  });
});
