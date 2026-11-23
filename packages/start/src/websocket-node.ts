import type { IncomingMessage } from "node:http";
import { connect } from "node:net";
import type { Duplex } from "node:stream";
import { NodeRequest } from "srvx/node";
import { resolveWebSocket } from "./websocket.ts";

/** Protocols Vite's own dev socket announces; those upgrades are Vite's to take. */
const VITE_PROTOCOLS = new Set(["vite-hmr", "vite-ping"]);

type Fetch = (request: Request) => Response | Promise<Response>;
type Listener = (req: IncomingMessage, socket: Duplex, head: Buffer) => void;

/**
 * A Node `upgrade` listener that hands each WebSocket upgrade to the route
 * that takes it, for a server barq does not start itself: Vite's dev and
 * preview servers. `serveBarq` installs the same through crossws's plugin.
 */
export function upgradeListener(fetch: Fetch): { listener: Listener; close: () => void } {
  const resolve = resolveWebSocket(fetch);
  const take = "Bun" in globalThis ? throughBun(resolve) : throughNode(resolve);
  return {
    listener(req, socket, head) {
      const protocol = req.headers["sec-websocket-protocol"];
      if (typeof protocol === "string" && VITE_PROTOCOLS.has(protocol)) return;
      take.listener(req, socket, head);
    },
    close: take.close,
  };
}

function throughNode(resolve: ReturnType<typeof resolveWebSocket>): {
  listener: Listener;
  close: () => void;
} {
  let adapter: Promise<import("crossws/adapters/node").NodeAdapter> | undefined;
  const ready = () =>
    (adapter ??= import("crossws/adapters/node").then(({ default: create }) =>
      create({ resolve }),
    ));
  return {
    listener(req, socket, head) {
      void ready()
        .then((ws) => ws.handleUpgrade(req, socket, head, new NodeRequest({ req })))
        .catch((error: unknown) => {
          console.error("[barq] WebSocket upgrade failed:", error);
          socket.destroy();
        });
    },
    close: () => void adapter?.then((ws) => ws.closeAll(1001, "server closing", true)),
  };
}

/**
 * Under Bun, `node:http` is a compatibility layer crossws will not attach its
 * Node adapter to, and Bun's own sockets are reached through `Bun.serve`. So
 * the upgrade is relayed, bytes as they came, to a loopback server running
 * the Bun adapter: the same one a Bun deployment runs, request headers and all.
 */
function throughBun(resolve: ReturnType<typeof resolveWebSocket>): {
  listener: Listener;
  close: () => void;
} {
  let server: Promise<{ port: number; stop(force: boolean): void }> | undefined;
  const ready = () =>
    (server ??= import("crossws/adapters/bun").then(({ default: create }) => {
      const ws = create({ resolve });
      const bun = (globalThis as unknown as { Bun: typeof Bun }).Bun;
      const served = bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        websocket: ws.websocket,
        fetch: (request, at) => ws.handleUpgrade(request, at),
      });
      return { port: served.port ?? 0, stop: (force: boolean) => void served.stop(force) };
    }));
  return {
    listener(req, socket, head) {
      void ready()
        .then(({ port }) => {
          const upstream = connect(port, "127.0.0.1", () => {
            let lines = `${req.method ?? "GET"} ${req.url ?? "/"} HTTP/1.1\r\n`;
            for (let at = 0; at < req.rawHeaders.length; at += 2) {
              lines += `${req.rawHeaders[at]}: ${req.rawHeaders[at + 1]}\r\n`;
            }
            upstream.write(`${lines}\r\n`);
            if (head.length > 0) upstream.write(head);
            socket.pipe(upstream).pipe(socket);
          });
          const drop = (): void => {
            upstream.destroy();
            socket.destroy();
          };
          upstream.on("error", drop);
          socket.on("error", drop);
        })
        .catch((error: unknown) => {
          console.error("[barq] WebSocket upgrade failed:", error);
          socket.destroy();
        });
    },
    close: () => void server?.then((running) => running.stop(true)),
  };
}
