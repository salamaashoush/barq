import type { Hooks, Message, Peer, WSError } from "crossws";

export type { Message as WebSocketMessage, Peer as WebSocketPeer, WSError as WebSocketError };

/** What a WebSocket route does with a connection: crossws's hooks, the shape Nitro and h3 use. */
export type WebSocketHooks = Partial<Hooks>;

/**
 * The response header that names a pending connection's hooks.
 *
 * A header, because it is the one part of a response that survives the trip
 * out of an app: the router rebuilds responses to fold in cookies and status,
 * and middleware may wrap them, and each of those drops any property a
 * handler hung on the object.
 */
const HOOKS_HEADER = "x-barq-websocket";

const REGISTRY = Symbol.for("barq.websocket.pending");

interface HooksRegistryHolder {
  [REGISTRY]?: Map<string, WebSocketHooks>;
}

interface Unrefable {
  unref?: () => void;
}

/**
 * Hooks waiting for the server to take their connection, by id.
 *
 * On `globalThis`, because in development the route that registers them runs
 * in Vite's module runner and the server that takes them does not: two module
 * instances, one process.
 */
function pending(): Map<string, WebSocketHooks> {
  const holder = globalThis as HooksRegistryHolder;
  return (holder[REGISTRY] ??= new Map());
}

/** A connection whose upgrade never reached the server is forgotten after this long. */
const UNCLAIMED_MS = 30_000;

/** Type the hooks of a WebSocket route without upgrading anything yet. */
export function defineWebSocket<T extends WebSocketHooks>(hooks: T): T {
  return hooks;
}

/**
 * Answer an upgrade request by taking the connection with `hooks`.
 *
 * Returned from a route's `server.handlers.GET`, after whatever checks the
 * route makes: a handler that returns any other response refuses the upgrade
 * with that response, so a 401 from an auth check reaches the client as one.
 *
 * ```ts
 * export const Route = createFileRoute("/rooms/$id")({
 *   server: {
 *     handlers: {
 *       GET: ({ request }) =>
 *         upgradeWebSocket(request, {
 *           open: (peer) => peer.subscribe("lobby"),
 *           message: (peer, message) => {
 *             peer.publish("lobby", message.text());
 *           },
 *         }),
 *     },
 *   },
 * });
 * ```
 *
 * A request that is not an upgrade gets 426, which is what a plain `GET` to a
 * socket address should hear.
 */
export function upgradeWebSocket(request: Request, hooks: WebSocketHooks): Response {
  if ((request.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
    return new Response("Upgrade Required", { status: 426, headers: { upgrade: "websocket" } });
  }
  const id = crypto.randomUUID();
  const waiting = pending();
  waiting.set(id, hooks);
  const timer = setTimeout(() => waiting.delete(id), UNCLAIMED_MS) as Unrefable;
  timer.unref?.();
  return new Response(null, { status: 200, headers: { [HOOKS_HEADER]: id } });
}

/**
 * The hooks for an upgrade, found by asking the app.
 *
 * The request goes through the same handler a page or an API route would, so
 * a WebSocket route is a route like any other. When it registered hooks they
 * take the connection; otherwise the app's answer refuses it, a 404 for an
 * address nothing serves.
 */
export function resolveWebSocket(
  fetch: (request: Request) => Response | Promise<Response>,
): (request: Request) => Promise<WebSocketHooks> {
  return async (request) => {
    const response = await fetch(request);
    const id = response.headers.get(HOOKS_HEADER);
    const hooks = id === null ? undefined : pending().get(id);
    if (id !== null) pending().delete(id);
    if (hooks !== undefined) return hooks;
    const refusal =
      response.status >= 400
        ? response
        : new Response("Not Found", { status: 404, headers: { "content-type": "text/plain" } });
    return { upgrade: () => refusal };
  };
}
