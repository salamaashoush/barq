import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import { DATA_SUFFIX, RPC_PREFIX } from "../src/index.ts";

const SERVER = fileURLToPath(new URL("./error-leak.server.ts", import.meta.url));

const port = 3600 + Math.floor(Math.random() * 100);
const origin = `http://127.0.0.1:${port}`;
let child: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  // What `bun dist/server/serve.js` is on a host that sets PORT and nothing
  // else: NODE_ENV is whatever the shell had, which is usually nothing.
  const { NODE_ENV: _unset, ...env } = process.env;
  child = Bun.spawn(["bun", SERVER], {
    env: { ...env, PORT: String(port) },
    stdout: "ignore",
    stderr: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(origin);
      break;
    } catch {
      await Bun.sleep(20);
    }
  }
}, 30_000);

afterAll(async () => {
  child.kill();
  await child.exited;
});

const call = (path: string): Promise<Response> =>
  fetch(`${origin}${RPC_PREFIX}${path}${DATA_SUFFIX}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}",
  });

describe("a failure inside the server-function endpoint, as a caller sees it", () => {
  test("a handler's error message does not reach the response", async () => {
    const response = await call("boom");
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).not.toContain("users_private");
    expect(body).not.toContain("error-leak.server.ts");
  });

  test("neither does the framework's own, for an id nobody mounted", async () => {
    const response = await call("%E0%A4%A");
    const body = await response.text();
    expect(body).not.toContain("URIError");
    expect(body).not.toContain("server.ts");
  });

  test("nor a page handler's, which the runtime would otherwise answer for", async () => {
    const response = await fetch(`${origin}/report`);
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).not.toContain("reports_private");
    expect(body).not.toContain("error-leak.server.ts");
  });
});
