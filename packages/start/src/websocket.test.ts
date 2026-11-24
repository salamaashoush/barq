import { afterAll, describe, expect, test } from "bun:test";
import type { Server } from "srvx";
import { serveBarq } from "./serve.ts";
import { resolveWebSocket, upgradeWebSocket } from "./websocket.ts";

function upgrade(url: string): Request {
  return new Request(url, { headers: { upgrade: "websocket", connection: "Upgrade" } });
}

describe("upgradeWebSocket", () => {
  test("answers a request that is not an upgrade with 426", () => {
    const response = upgradeWebSocket(new Request("http://localhost/room"), {});
    expect(response.status).toBe(426);
    expect(response.headers.get("upgrade")).toBe("websocket");
  });

  test("hands its hooks to the resolver once, through a response the app may rebuild", async () => {
    function open(): void {
      return undefined;
    }
    const resolve = resolveWebSocket((request) => {
      const answered = upgradeWebSocket(request, { open });
      return new Response(answered.body, answered);
    });
    const hooks = await resolve(upgrade("http://localhost/room"));
    expect(hooks.open).toBe(open);
  });

  test("refuses with the app's own answer, or 404 when the app answered something else", async () => {
    const denied = await resolveWebSocket(() => new Response("no", { status: 403 }))(
      upgrade("http://localhost/room"),
    );
    const refusal = (await denied.upgrade?.(upgrade("http://localhost/room"))) as Response;
    expect(refusal.status).toBe(403);

    const page = await resolveWebSocket(() => new Response("<html>"))(upgrade("http://localhost/"));
    const missing = (await page.upgrade?.(upgrade("http://localhost/"))) as Response | undefined;
    expect(missing?.status).toBe(404);
  });
});

describe("serveBarq with a WebSocket route", () => {
  let server: Server | undefined;
  afterAll(async () => {
    await server?.close(true);
  });

  test("takes the upgrade a route registered, and refuses the rest", async () => {
    server = await serveBarq({
      port: 0,
      hostname: "127.0.0.1",
      silent: true,
      fetch: (request) => {
        const { pathname } = new URL(request.url);
        if (pathname === "/echo") {
          return upgradeWebSocket(request, {
            open: (peer) => {
              peer.send("ready");
            },
            message: (peer, message) => {
              peer.send(`echo ${message.text()}`);
            },
          });
        }
        return new Response("not found", { status: 404 });
      },
    });
    await server.ready();
    const base = server.url!.replace(/^http/, "ws");

    const seen = await new Promise<string[]>((resolve, reject) => {
      const received: string[] = [];
      const socket = new WebSocket(new URL("/echo", base));
      socket.addEventListener("open", () => socket.send("salama"));
      socket.addEventListener("message", (event) => {
        received.push(String(event.data));
        if (received.length === 2) {
          socket.close();
          resolve(received);
        }
      });
      socket.addEventListener("error", () => reject(new Error("the echo socket failed")));
    });
    expect(seen).toEqual(["ready", "echo salama"]);

    const refused = await new Promise<boolean>((resolve) => {
      const socket = new WebSocket(new URL("/nothing", base));
      socket.addEventListener("open", () => resolve(false));
      socket.addEventListener("error", () => resolve(true));
    });
    expect(refused).toBe(true);
  });
});
