/**
 * Two properties a module-global client cannot have: the provider forks the
 * context on its own instance scope, so a consumer sees the client above it
 * rather than whichever was set last, and two clients can coexist on one page.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { flush, render } from "@barqjs/core";
import { QueryClient } from "@tanstack/query-core";
import {
  QueryClientProvider,
  useIsFetching,
  useMutation,
  useQuery,
  useQueryClient,
} from "./query.ts";

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
  return <div>{() => (query().data ?? []).join(",")}</div>;
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
    <button type="button" onClick={() => mutation().mutate("zoe")}>
      {() => mutation().data ?? "idle"}
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
