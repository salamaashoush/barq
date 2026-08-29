/**
 * A headless Chrome, over CDP, with no dependencies.
 *
 * happy-dom has hidden three separate bug classes on this project — HTML tree
 * construction, the tokenizer's NUL/CR rewriting, and `SVGElement.className` —
 * and each one was a green suite over a compiler that was wrong in a browser.
 * So the browser checks are not optional extras: they are the only oracle for
 * the refusals in `lower/parse.rs`, `lower/text.rs` and the runtime's SVG
 * branch. This is the driver they share, so getting them into `bun test` and
 * into CI costs one Chrome launch rather than one per check.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";

const CANDIDATES = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
];

/**
 * Where Chrome is, or a loud failure. Never a silent skip: a browser check that
 * quietly does nothing when the browser is missing is the same failure mode as
 * an assertion that cannot fail, and this suite has already been bitten by it.
 */
export function chromePath(explicit?: string): string {
  const fromArgv = process.argv.indexOf("--chrome");
  const candidate =
    explicit ??
    (fromArgv === -1 ? undefined : process.argv[fromArgv + 1]) ??
    process.env.CHROME_PATH;
  if (candidate) {
    if (!existsSync(candidate)) throw new Error(`no Chrome at ${candidate}`);
    return candidate;
  }
  const found = CANDIDATES.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      `no Chrome found; tried ${CANDIDATES.join(", ")}. Set CHROME_PATH or pass --chrome <path>. ` +
        "These checks are the only oracle for HTML tree construction and the SVG class branch, " +
        "so they fail rather than skip.",
    );
  }
  return found;
}

export interface Page {
  /** Evaluate an expression in the page and return its value. */
  evaluate<T>(expression: string): Promise<T>;
  /** Open a new target and make it the one `evaluate` runs against. */
  open(url: string): Promise<void>;
  /**
   * A raw CDP call against the attached target.
   *
   * `Input.dispatchKeyEvent` is why this exists: a keystroke synthesised in the
   * page with `dispatchEvent` never reaches the browser's own editing code, so
   * it cannot move a caret and cannot falsify B7. Only the browser can type.
   */
  send(method: string, params: unknown): Promise<unknown>;
}

interface Connection {
  send(
    method: string,
    params: unknown,
    sessionId?: string,
  ): Promise<{ result?: Record<string, unknown> }>;
  close(): void;
}

/**
 * `node:http`, not `fetch`. Under `bun test` the happy-dom registrator in
 * test/preload.ts has already replaced the global `fetch` with a browser one,
 * and a browser `fetch` applies the same-origin policy to 127.0.0.1 — so the
 * CDP handshake fails with a CORS error and never reaches Chrome at all.
 */
function get(port: number, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    import("node:http").then(({ request }) => {
      const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => resolve(body));
      });
      req.on("error", reject);
      req.end();
    }, reject);
  });
}

async function connect(port: number): Promise<Connection> {
  let wsUrl: string | undefined;
  // The failure mode here is a cold start under load — the root `bun run test`
  // has five workspace test processes and cargo competing for the machine — so
  // the budget backs off to ~30s rather than the 10s a fixed 50ms poll gives.
  for (let attempt = 0; attempt < 200 && !wsUrl; attempt++) {
    try {
      const body = await get(port, "/json/version");
      wsUrl = (JSON.parse(body) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    if (!wsUrl) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(250, 50 + attempt * 10)));
    }
  }
  if (!wsUrl) throw new Error("Chrome did not expose a debugging endpoint");

  // happy-dom's WebSocket throws on any URL carrying a path, and every CDP
  // endpoint is `ws://host:port/devtools/browser/<id>`. test/preload.ts keeps
  // the runtime's own constructor for exactly this; outside `bun test` the
  // global is already the real one.
  const Socket =
    (globalThis as { __barqNativeWebSocket?: typeof WebSocket }).__barqNativeWebSocket ?? WebSocket;
  const socket = new Socket(wsUrl);
  await Promise.race([
    new Promise((resolve) => (socket.onopen = resolve)),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Chrome accepted no CDP socket within 15s")), 15_000),
    ),
  ]);

  let id = 0;
  const pending = new Map<number, (value: Record<string, unknown>) => void>();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number };
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)?.(message as Record<string, unknown>);
      pending.delete(message.id);
    }
  };

  return {
    send(method, params, sessionId) {
      const mid = ++id;
      return new Promise((resolve) => {
        pending.set(mid, resolve as never);
        socket.send(JSON.stringify({ id: mid, sessionId, method, params }));
      });
    },
    close: () => socket.close(),
  };
}

/** Run `body` against a fresh headless Chrome, and always tear it down. */
export async function withChrome<T>(
  body: (page: Page) => Promise<T>,
  options: { binary?: string; profile?: string } = {},
): Promise<T> {
  const binary = chromePath(options.binary);
  const base = options.profile ?? `/tmp/barq-chrome-${process.pid}-${Date.now()}`;
  // Deterministic per process rather than random: a random port has no bind
  // check, so two concurrent runs over this package could pick the same number
  // and one of them would attach to the other's Chrome. The sweep covers a port
  // that is genuinely taken by something else.
  const firstPort = 9200 + (process.pid % 500);
  const profiles: string[] = [];
  let chrome: ChildProcess | undefined;
  let connection: Connection | undefined;

  try {
    for (let offset = 0; connection === undefined; offset++) {
      const port = 9200 + ((firstPort - 9200 + offset) % 500);
      const profile = offset === 0 ? base : `${base}-${offset}`;
      profiles.push(profile);
      const candidate = spawn(
        binary,
        [
          "--headless=new",
          `--remote-debugging-port=${port}`,
          "--no-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          `--user-data-dir=${profile}`,
          "about:blank",
        ],
        { stdio: "ignore" },
      );
      try {
        connection = await connect(port);
        chrome = candidate;
      } catch (error) {
        candidate.kill();
        if (offset === 4) throw error;
      }
    }

    let sessionId: string | undefined;
    const page: Page = {
      async open(url) {
        const target = await connection!.send("Target.createTarget", { url });
        const targetId = (target.result as { targetId: string }).targetId;
        const attached = await connection!.send("Target.attachToTarget", {
          targetId,
          flatten: true,
        });
        sessionId = (attached.result as { sessionId: string }).sessionId;
      },
      async send(method, params) {
        const result = await connection!.send(method, params, sessionId);
        return result.result;
      },
      async evaluate<T>(expression: string) {
        const evaluated = await connection!.send(
          "Runtime.evaluate",
          { expression, returnByValue: true, awaitPromise: true },
          sessionId,
        );
        const payload = evaluated.result as {
          result?: { value?: unknown };
          exceptionDetails?: unknown;
        };
        if (payload.exceptionDetails) throw new Error(JSON.stringify(payload.exceptionDetails));
        return payload.result?.value as T;
      },
    };

    await page.open("about:blank");
    return await body(page);
  } finally {
    connection?.close();
    chrome?.kill();
    const { rmSync } = await import("node:fs");
    for (const profile of profiles) rmSync(profile, { recursive: true, force: true });
  }
}
