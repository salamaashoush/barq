/**
 * The adapter against the shapes an application on `@tanstack/react-db` uses:
 * `queryCollectionOptions` collections over one `QueryClient`, `eq` filters
 * that a nullable id disables, `findOne`, `orderBy` and a descending infinite
 * list. Each hook is read the way a barq component reads it, field by field,
 * and every input that changes is a signal.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { Errored, For, Loading, Show, createRoot, createSignal, flush } from "@barqjs/core";
import { render } from "@barqjs/web";

import {
  DbClient,
  DbProvider,
  HydrationBoundary,
  collectionOptions,
  createCollection,
  debounceStrategy,
  eq,
  localOnlyCollectionOptions,
  useLiveInfiniteQuery,
  useLiveQuery,
  useLiveQueryEffect,
  useLiveSuspenseQuery,
  usePacedMutations,
} from "./index.ts";
import {
  type Channel,
  type Message,
  settle,
  status,
  subscribers,
  workspace,
} from "./test-helpers.ts";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

function mounted<T>(build: () => T): T {
  let result!: T;
  createRoot((dispose) => {
    cleanups.push(dispose);
    result = build();
  });
  return result;
}

function host(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

describe("the shapes a chat app on react-db uses", () => {
  test("an eq filter that a missing workspace id disables", async () => {
    const { channelsCollection, api } = workspace();
    const [workspaceId, setWorkspaceId] = createSignal<string | null>(null);
    const list = mounted(() =>
      useLiveQuery((q) => {
        const id = workspaceId();
        return id
          ? q
              .from({ channels: channelsCollection })
              .where(({ channels }) => eq(channels.workspace_id, id))
          : null;
      }),
    );

    await settle();
    expect(list.isEnabled).toBe(false);
    expect(list.status).toBe("disabled");
    expect(list.isReady).toBe(true);
    expect(list.data).toBeUndefined();
    expect(list.state).toBeUndefined();
    expect(api.calls.channels).toBe(0);

    setWorkspaceId("acme");
    flush();
    expect(list.isEnabled).toBe(true);
    expect(list.isLoading).toBe(true);
    await settle();
    expect(list.status).toBe("ready");
    expect(list.data?.map((channel) => channel.id)).toEqual(["general", "random", "secret"]);
    expect(list.state?.get("secret")?.is_private).toBe(true);

    setWorkspaceId("example");
    await settle();
    expect(list.data?.map((channel) => channel.id)).toEqual(["other"]);
    expect(api.calls.channels).toBe(1);
  });

  test("findOne by id is one row, follows updates, and is undefined once deleted", async () => {
    const { channelsCollection, api } = workspace();
    const [channelId, setChannelId] = createSignal<string | null>("general");
    const channel = mounted(() =>
      useLiveQuery((q) => {
        const id = channelId();
        return id
          ? q
              .from({ channels: channelsCollection })
              .where(({ channels }) => eq(channels.id, id))
              .findOne()
          : null;
      }),
    );

    expect(channel.isLoading).toBe(true);
    expect(channel.data).toBeUndefined();
    await settle();
    expect(channel.isReady).toBe(true);
    expect(channel.data?.name).toBe("general");

    api.channels[0] = { ...api.channels[0], name: "announcements" };
    await channelsCollection.utils.refetch();
    await settle();
    expect(channel.data?.name).toBe("announcements");

    setChannelId("random");
    await settle();
    expect(channel.data?.id).toBe("random");

    api.channels.splice(1, 1);
    await channelsCollection.utils.refetch();
    await settle();
    expect(channel.data).toBeUndefined();
    expect(channel.isReady).toBe(true);
  });

  test("orderBy descending, as the conversation list sorts", async () => {
    const { messagesCollection } = workspace();
    const latest = mounted(() =>
      useLiveQuery((q) =>
        q
          .from({ messages: messagesCollection })
          .where(({ messages }) => eq(messages.channel_id, "general"))
          .orderBy(({ messages }) => messages.created_at, "desc"),
      ),
    );
    await settle();
    expect(latest.data.map((message) => message.id)).toEqual(["m5", "m4", "m3", "m2", "m1"]);
  });

  test("a descending infinite list pages, stays live, and restarts on a new channel", async () => {
    const { messagesCollection, api } = workspace();
    const [channelId, setChannelId] = createSignal("general");
    const feed = mounted(() =>
      useLiveInfiniteQuery(
        (q) =>
          q
            .from({ messages: messagesCollection })
            .where(({ messages }) => eq(messages.channel_id, channelId()))
            .orderBy(({ messages }) => messages.created_at, "desc"),
        { pageSize: 2 },
      ),
    );

    expect(feed.isLoading).toBe(true);
    await settle();
    expect(feed.isReady).toBe(true);
    expect(feed.data.map((message) => message.id)).toEqual(["m5", "m4"]);
    expect(feed.pages).toHaveLength(1);
    expect(feed.pageParams).toEqual([0]);
    expect(feed.hasNextPage).toBe(true);

    const fetched = feed.fetchNextPage();
    flush();
    await fetched;
    await settle();
    expect(feed.data.map((message) => message.id)).toEqual(["m5", "m4", "m3", "m2"]);
    expect(feed.pages.map((page) => page.length)).toEqual([2, 2]);
    expect(feed.pageParams).toEqual([0, 1]);

    await feed.fetchNextPage();
    await settle();
    expect(feed.data).toHaveLength(5);
    expect(feed.hasNextPage).toBe(false);
    expect(feed.isFetchingNextPage).toBe(false);

    api.messages.push({
      id: "m8",
      channel_id: "general",
      text: "newest",
      created_at: "2026-11-09T00:00:00.000Z",
    });
    await messagesCollection.utils.refetch();
    await settle();
    expect(feed.data[0]?.id).toBe("m8");
    expect(feed.data).toHaveLength(6);

    setChannelId("random");
    await settle();
    expect(feed.data.map((message) => message.id)).toEqual(["m7", "m6"]);
    expect(feed.pages).toHaveLength(1);
  });

  test("a keyed For keeps a row's element when only its fields change", async () => {
    const { channelsCollection, api } = workspace();
    const element = host();
    const dispose = render(() => {
      const list = useLiveQuery((q) =>
        q
          .from({ channels: channelsCollection })
          .where(({ channels }) => eq(channels.workspace_id, "acme")),
      );
      return (
        <ul>
          <For each={list.data} keyed={(channel: Channel) => channel.id}>
            {(channel: () => Channel) => <li>{channel().name}</li>}
          </For>
        </ul>
      );
    }, element);
    cleanups.push(dispose);

    await settle();
    expect(element.textContent).toBe("generalrandomsecret");
    const first = element.querySelector("li");

    api.channels[0] = { ...api.channels[0], name: "lobby" };
    await channelsCollection.utils.refetch();
    await settle();
    expect(element.textContent).toBe("lobbyrandomsecret");
    expect(element.querySelector("li")).toBe(first);
  });
});

describe("owner disposal", () => {
  test("disposing the owner releases every subscription and retires the live query", async () => {
    const { channelsCollection } = workspace();
    let dispose!: () => void;
    const list = createRoot((release) => {
      dispose = release;
      return useLiveQuery((q) => q.from({ channels: channelsCollection }));
    });
    await settle();
    expect(list.data).toHaveLength(4);
    expect(channelsCollection.subscriberCount).toBe(1);
    const liveCollection = list.collection;

    dispose();
    flush();
    await subscribers(channelsCollection, 0);
    await status(liveCollection, "cleaned-up");
    expect(channelsCollection.subscriberCount).toBe(0);
    expect(liveCollection.subscriberCount).toBe(0);
  });

  test("a recompile retires the previous live query and keeps one subscription", async () => {
    const { channelsCollection } = workspace();
    const [workspaceId, setWorkspaceId] = createSignal("acme");
    const list = mounted(() =>
      useLiveQuery((q) =>
        q
          .from({ channels: channelsCollection })
          .where(({ channels }) => eq(channels.workspace_id, workspaceId())),
      ),
    );
    await settle();
    const before = list.collection;

    setWorkspaceId("example");
    flush();
    await status(before, "cleaned-up");
    await subscribers(channelsCollection, 1);
    expect(list.collection).not.toBe(before);
    expect(channelsCollection.subscriberCount).toBe(1);
  });

  test("a component that unmounts under Show releases its query", async () => {
    const { channelsCollection } = workspace();
    const [shown, setShown] = createSignal(true);
    function Count() {
      const list = useLiveQuery((q) => q.from({ channels: channelsCollection }));
      return <b>{list.data.length}</b>;
    }
    const element = host();
    cleanups.push(
      render(
        () => (
          <Show when={shown()}>
            <Count />
          </Show>
        ),
        element,
      ),
    );
    await settle();
    expect(element.textContent).toBe("4");
    expect(channelsCollection.subscriberCount).toBe(1);

    setShown(false);
    flush();
    await subscribers(channelsCollection, 0);
    expect(element.textContent).toBe("");
    expect(channelsCollection.subscriberCount).toBe(0);
  });

  test("an infinite query and a live-query effect release on disposal", async () => {
    const { messagesCollection } = workspace();
    const entered: string[] = [];
    let dispose!: () => void;
    createRoot((release) => {
      dispose = release;
      useLiveInfiniteQuery(
        (q) =>
          q
            .from({ messages: messagesCollection })
            .orderBy(({ messages }) => messages.created_at, "desc"),
        { pageSize: 2 },
      );
      useLiveQueryEffect<Message, string>({
        query: (q) => q.from({ messages: messagesCollection }),
        onEnter: (event) => {
          entered.push(event.key);
        },
      });
    });
    flush();
    await messagesCollection.toArrayWhenReady();
    expect(entered).toHaveLength(7);
    expect(messagesCollection.subscriberCount).toBe(2);

    dispose();
    flush();
    await subscribers(messagesCollection, 0);
    expect(messagesCollection.subscriberCount).toBe(0);
  });
});

describe("suspense", () => {
  test("useLiveSuspenseQuery parks the Loading boundary until the first result", async () => {
    const { channelsCollection } = workspace();
    function Names() {
      const list = useLiveSuspenseQuery((q) =>
        q
          .from({ channels: channelsCollection })
          .where(({ channels }) => eq(channels.is_private, false))
          .orderBy(({ channels }) => channels.name),
      );
      return <p>{list.data.map((channel) => channel.name).join(",")}</p>;
    }
    const element = host();
    cleanups.push(
      render(
        () => (
          <Loading fallback={<i>loading</i>}>
            <Names />
          </Loading>
        ),
        element,
      ),
    );
    flush();
    expect(element.textContent).toBe("loading");
    await settle(30);
    expect(element.textContent).toBe("general,other,random");
  });

  test("a failed first load reaches the Errored boundary", async () => {
    const failing = createCollection<{ id: string }, string>({
      id: `failing-${crypto.randomUUID()}`,
      getKey: (row) => row.id,
      sync: {
        sync: ({ markReady }) => {
          void markReady;
          throw new Error("the sync could not start");
        },
      },
    });
    function Rows() {
      const rows = useLiveSuspenseQuery((q) => q.from({ rows: failing }));
      return <p>{rows.data.length}</p>;
    }
    const element = host();
    cleanups.push(
      render(
        () => (
          <Errored fallback={(error: () => Error) => <b>caught: {error().message}</b>}>
            <Loading fallback={<i>loading</i>}>
              <Rows />
            </Loading>
          </Errored>
        ),
        element,
      ),
    );
    await settle(30);
    expect(element.textContent).toContain("caught:");
    expect(element.textContent).toContain("the sync could not start");
  });
});

describe("DbClient", () => {
  interface Todo {
    id: string;
    title: string;
  }

  const todos = collectionOptions(
    localOnlyCollectionOptions<Todo>({
      id: "todos",
      getKey: (todo) => todo.id,
      initialData: [
        { id: "a", title: "write the adapter" },
        { id: "b", title: "run the suite" },
      ],
    }),
  );

  test("a DbProvider resolves descriptors, and HydrationBoundary seeds the client", async () => {
    const server = new DbClient();
    await server.preloadLiveQuery({ query: (q) => q.from({ todo: todos }) });
    const state = server.dehydrate();
    expect(state.liveQueries?.length ?? 0).toBeGreaterThan(0);

    const client = new DbClient();
    const element = host();
    cleanups.push(() => void client.cleanup());
    cleanups.push(
      render(() => {
        function Titles() {
          const list = useLiveQuery({ query: (q) => q.from({ todo: todos }) });
          return <p>{list.data.map((todo) => todo.title).join("|")}</p>;
        }
        return (
          <DbProvider client={client}>
            <HydrationBoundary state={state}>
              <Titles />
            </HydrationBoundary>
          </DbProvider>
        );
      }, element),
    );
    flush();
    expect(element.textContent).toBe("write the adapter|run the suite");
    await settle();
    expect(element.textContent).toBe("write the adapter|run the suite");

    client.collection(todos).insert({ id: "c", title: "ship it" });
    await settle();
    expect(element.textContent).toBe("write the adapter|run the suite|ship it");
  });
});

describe("paced mutations", () => {
  test("usePacedMutations applies at once and persists once per debounce window", async () => {
    const persisted: string[][] = [];
    const notes = createCollection(
      localOnlyCollectionOptions<{ id: string; text: string }>({
        id: `notes-${crypto.randomUUID()}`,
        getKey: (note) => note.id,
        initialData: [{ id: "n", text: "" }],
      }),
    );
    const { edit, list } = mounted(() => ({
      edit: usePacedMutations<string, { id: string; text: string }>({
        onMutate: (text) => {
          notes.update("n", (draft) => {
            draft.text = text;
          });
        },
        mutationFn: async ({ transaction }) => {
          persisted.push(transaction.mutations.map((mutation) => mutation.modified.text));
        },
        strategy: debounceStrategy({ wait: 20 }),
      }),
      list: useLiveQuery((q) => q.from({ notes })),
    }));
    await settle();

    edit("h");
    edit("hi");
    await settle(1);
    expect(list.data[0]?.text).toBe("hi");
    expect(persisted).toEqual([]);
    await settle(40);
    expect(persisted).toEqual([["hi"]]);
  });
});
