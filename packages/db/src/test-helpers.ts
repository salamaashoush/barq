import { flush } from "@barqjs/core";
import { QueryClient } from "@tanstack/query-core";
import { type QueryCollectionUtils, queryCollectionOptions } from "@tanstack/query-db-collection";

import { BasicIndex, type Collection, createCollection } from "./index.ts";

/** Staged writes applied, the sync and fetch work they start given time, then applied again. */
export async function settle(ms = 15): Promise<void> {
  flush();
  await new Promise((resolve) => setTimeout(resolve, ms));
  flush();
}

interface SubscriberChange {
  subscriberCount: number;
}

interface Watched {
  readonly subscriberCount: number;
  on(event: "subscribers:change", listener: (event: SubscriberChange) => void): () => void;
}

interface StatusChange {
  status: string;
}

interface Staged {
  readonly status: string;
  on(event: "status:change", listener: (event: StatusChange) => void): () => void;
}

/** Resolves once `collection` reaches `status`, on the same chain {@link subscribers} waits out. */
export function status(collection: Staged, wanted: string): Promise<void> {
  if (collection.status === wanted) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = collection.on("status:change", (event) => {
      if (event.status !== wanted) return;
      stop();
      resolve();
    });
  });
}

/**
 * Resolves once `collection` has `count` subscribers. A live query a hook let go
 * of is released on its collection's GC timer, then an idle callback, then an
 * async cleanup: a chain a fixed sleep loses to whenever the machine is slow.
 */
export function subscribers(collection: Watched, count: number): Promise<void> {
  if (collection.subscriberCount === count) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = collection.on("subscribers:change", (event) => {
      if (event.subscriberCount !== count) return;
      stop();
      resolve();
    });
  });
}

export interface Channel {
  id: string;
  workspace_id: string;
  name: string;
  is_private: boolean;
}

export interface Message {
  id: string;
  channel_id: string;
  text: string;
  created_at: string;
}

export interface ApiCalls {
  channels: number;
  messages: number;
}

export interface Api {
  channels: Channel[];
  messages: Message[];
  calls: ApiCalls;
}

/** An in-memory API, and how often each list endpoint was called. */
export function server(): Api {
  const channels: Channel[] = [
    { id: "general", workspace_id: "acme", name: "general", is_private: false },
    { id: "random", workspace_id: "acme", name: "random", is_private: false },
    { id: "secret", workspace_id: "acme", name: "secret", is_private: true },
    { id: "other", workspace_id: "example", name: "other", is_private: false },
  ];
  const messages: Message[] = Array.from({ length: 7 }, (_, index) => ({
    id: `m${index + 1}`,
    channel_id: index < 5 ? "general" : "random",
    text: `message ${index + 1}`,
    created_at: `2026-11-0${index + 1}T00:00:00.000Z`,
  }));
  const calls = { channels: 0, messages: 0 };
  return { channels, messages, calls };
}

/**
 * A chat app's collections as an application on `@tanstack/react-db` builds
 * them: `queryCollectionOptions` over one shared `QueryClient`, messages with
 * an eager `BasicIndex`.
 */
export interface Workspace {
  api: Api;
  queryClient: QueryClient;
  channelsCollection: QueryCollection<Channel>;
  messagesCollection: QueryCollection<Message>;
}

type QueryCollection<T extends object> = Collection<
  T,
  string | number,
  QueryCollectionUtils<T, string | number, T>,
  never,
  T
>;

export function workspace(api: Api = server()): Workspace {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  function tick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 1));
  }

  const channelsCollection = createCollection(
    queryCollectionOptions<Channel>({
      id: `channels-${crypto.randomUUID()}`,
      queryKey: ["channels-collection"],
      queryFn: async () => {
        api.calls.channels++;
        await tick();
        return api.channels.map((channel) => ({ ...channel }));
      },
      queryClient,
      getKey: (channel) => channel.id,
    }),
  );

  const messagesCollection = createCollection(
    queryCollectionOptions<Message>({
      id: `messages-${crypto.randomUUID()}`,
      queryKey: ["messages-collection"],
      autoIndex: "eager",
      defaultIndexType: BasicIndex,
      queryFn: async () => {
        api.calls.messages++;
        await tick();
        return api.messages.map((message) => ({ ...message }));
      },
      queryClient,
      getKey: (message) => message.id,
    }),
  );

  return { api, queryClient, channelsCollection, messagesCollection };
}
