import {
  type Cell,
  type JSXElement,
  cell,
  createContext,
  provide,
  read,
  readSlot,
} from "@barqjs/core";
import type { DbClient } from "@tanstack/db";

const CLIENT = createContext<DbClient>(undefined, "barq-db-client");

export interface DbProviderProps {
  client: DbClient;
  children?: unknown;
}

/** A children slot, built: the compiler hands one over as a thunk. */
export function built(children: unknown): unknown {
  return typeof children === "function" ? (children as () => unknown)() : children;
}

interface DbProviderCells {
  client: Cell<DbClient>;
  children?: unknown;
}

/**
 * The `DbClient` that resolves collection descriptors for every live query
 * below it. `children` is built inside the provided scope, so a hook
 * constructed there reads this client rather than an outer one.
 */
export const DbProvider = ((props: DbProviderCells): unknown => {
  const client = readSlot(props.client, "DbProvider.client") as DbClient;
  return provideDbClient(client, () => built(props.children));
}) as unknown as (props: DbProviderProps) => JSXElement;

/** `DbProvider` for a caller that already has the client and a builder in hand. */
export function provideDbClient(client: DbClient, build: () => unknown): unknown {
  return provide(CLIENT, cell(client), build);
}

/** The client in scope, or `undefined` outside every `DbProvider`. */
export function useOptionalDbClient(): DbClient | undefined {
  try {
    return read(CLIENT)();
  } catch {
    // No provider is the ordinary case for an app on `createCollection`.
    return undefined;
  }
}

/** The client in scope; throws outside every `DbProvider`. */
export function useDbClient(): DbClient {
  const client = useOptionalDbClient();
  if (client === undefined) {
    throw new Error(
      "[barq] useDbClient was called outside a `DbProvider`, so there is no `DbClient` to resolve collection descriptors against. " +
        "Wrap the tree in `<DbProvider client={dbClient}>`.",
    );
  }
  return client;
}
