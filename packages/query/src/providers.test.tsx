/**
 * The providers around the hooks: state handed in from another client, a cache
 * restored from storage, and the devtools panel.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import { createSignal, flush, render } from "@barqjs/core";
import type { PersistedClient, Persister } from "@tanstack/query-persist-client-core";

import { BarqQueryDevtools } from "./devtools.ts";
import {
  type DehydratedState,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  dehydrate,
  useIsRestoring,
  useQuery,
} from "./index.ts";
import { PersistQueryClientProvider } from "./persist.ts";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function settled(ms = 10): Promise<void> {
  await tick(ms);
  flush();
}

function host(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

async function dehydratedWith(key: string, value: string): Promise<DehydratedState> {
  const source = new QueryClient();
  await source.prefetchQuery({ queryKey: [key], queryFn: async () => value });
  const state = dehydrate(source);
  source.clear();
  return state;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("HydrationBoundary", () => {
  test("a query below it starts with the dehydrated data and does not fetch", async () => {
    const state = await dehydratedWith("profile", "from-the-server");
    const queryClient = new QueryClient();
    let fetches = 0;

    function Profile() {
      const query = useQuery(() => ({
        queryKey: ["profile"],
        queryFn: async () => {
          fetches++;
          return "from-the-client";
        },
        staleTime: 60_000,
      }));
      return <p>{() => `${query.status}:${query.data}`}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <HydrationBoundary state={state}>
            <Profile />
          </HydrationBoundary>
        </QueryClientProvider>
      ),
      element,
    );
    expect(element.textContent).toBe("success:from-the-server");
    await settled();
    expect(fetches).toBe(0);
    expect(element.textContent).toBe("success:from-the-server");
    dispose();
    queryClient.clear();
  });

  test("newer state for a query already on screen is written after the build", async () => {
    const queryClient = new QueryClient();
    const older = await dehydratedWith("feed", "first");
    const [state, setState] = createSignal<DehydratedState>(older);

    function Feed() {
      const query = useQuery(() => ({
        queryKey: ["feed"],
        queryFn: async () => "fetched",
        staleTime: 60_000,
      }));
      return <p>{() => query.data}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <HydrationBoundary state={state()}>
            <Feed />
          </HydrationBoundary>
        </QueryClientProvider>
      ),
      element,
    );
    await settled();
    expect(element.textContent).toBe("first");

    await tick(5);
    setState(await dehydratedWith("feed", "second"));
    await settled();
    expect(element.textContent).toBe("second");
    dispose();
    queryClient.clear();
  });
});

describe("PersistQueryClientProvider", () => {
  test("restores before anything fetches, then writes changes back", async () => {
    const stored: { client?: PersistedClient; writes: number } = { writes: 0 };
    stored.client = {
      timestamp: Date.now(),
      buster: "",
      clientState: await dehydratedWith("draft", "from-storage"),
    };
    const persister: Persister = {
      persistClient: async (persisted) => {
        stored.client = persisted;
        stored.writes++;
      },
      restoreClient: async () => {
        await tick(20);
        return stored.client;
      },
      removeClient: async () => {
        stored.client = undefined;
      },
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 60_000 } } });
    let fetches = 0;
    let restored = 0;

    function Draft() {
      const restoring = useIsRestoring();
      const query = useQuery(() => ({
        queryKey: ["draft"],
        queryFn: async () => {
          fetches++;
          return "from-the-network";
        },
        staleTime: 60_000,
      }));
      return <p>{() => `${restoring()}:${query.fetchStatus}:${query.data}`}</p>;
    }

    const element = host();
    const dispose = render(
      () => (
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister }}
          onSuccess={() => {
            restored++;
          }}
        >
          <Draft />
        </PersistQueryClientProvider>
      ),
      element,
    );
    await settled(5);
    expect(element.textContent).toBe("true:idle:undefined");
    expect(fetches).toBe(0);

    await settled(40);
    expect(element.textContent).toBe("false:idle:from-storage");
    expect(fetches).toBe(0);
    expect(restored).toBe(1);

    const before = stored.writes;
    queryClient.setQueryData(["draft"], "edited");
    await settled(20);
    expect(stored.writes).toBeGreaterThan(before);
    expect(stored.client?.clientState.queries[0]?.state.data).toBe("edited");
    expect(element.textContent).toBe("false:idle:edited");
    dispose();
    queryClient.clear();
  });
});

describe("BarqQueryDevtools", () => {
  /**
   * The panel itself is stood in for. `@tanstack/query-devtools` is built on
   * Solid 1, whose delegated events keep their handlers under the same
   * `__bq_click` expando this runtime uses, and its document listeners outlive the
   * panel: loading the real one here would make every delegated handler in
   * every later test file run twice.
   */
  test("imports the panel when built, mounts it beside the application, and takes it away", async () => {
    const made: Panel[] = [];
    class Panel {
      mountedOn: HTMLElement | undefined;
      theme: string | undefined;
      position: string | undefined;
      constructor(readonly config: Record<string, unknown>) {
        made.push(this);
      }
      mount(element: HTMLElement): void {
        this.mountedOn = element;
      }
      unmount(): void {
        this.mountedOn = undefined;
      }
      setButtonPosition(): void {}
      setPosition(position: string): void {
        this.position = position;
      }
      setInitialIsOpen(): void {}
      setErrorTypes(): void {}
      setTheme(theme: string): void {
        this.theme = theme;
      }
    }
    await mock.module("@tanstack/query-devtools", () => ({ TanstackQueryDevtools: Panel }));

    const queryClient = new QueryClient();
    const [position, setPosition] = createSignal<"bottom" | "left">("bottom");
    const element = host();
    const dispose = render(
      () => (
        <QueryClientProvider client={queryClient}>
          <p>app</p>
          <BarqQueryDevtools initialIsOpen={false} position={position()} theme="dark" />
        </QueryClientProvider>
      ),
      element,
    );
    expect(element.textContent).toBe("app");
    expect(made).toHaveLength(0);

    await settled(20);
    const [panel] = made;
    expect(panel?.config).toMatchObject({
      client: queryClient,
      queryFlavor: "Barq Query",
      position: "bottom",
      theme: "dark",
      initialIsOpen: false,
    });
    const parent = document.querySelector(".tsqd-parent-container");
    expect(panel?.mountedOn).toBe(parent as HTMLElement);
    expect(element.contains(parent)).toBe(false);

    setPosition("left");
    await settled();
    expect(panel?.position).toBe("left");

    dispose();
    expect(panel?.mountedOn).toBeUndefined();
    expect(document.querySelector(".tsqd-parent-container")).toBeNull();
    queryClient.clear();
  });
});
