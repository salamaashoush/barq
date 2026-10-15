import { afterEach, expect, test } from "bun:test";

import { RPC_PREFIX, serverRpc } from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

afterEach(unmountAll);

const ORIGIN = "https://app.test";

test("an id that is not valid percent-encoding is refused, not thrown", async () => {
  const request = new Request(`${ORIGIN}${RPC_PREFIX}%E0%A4%A.data`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: "{}",
  });

  const outcome = await handleServerFn(request).then(
    (response) => response?.status,
    (error: unknown) => `threw ${(error as Error).name}`,
  );

  expect(outcome).toBeOneOf([400, 404]);
});

const submitFrom = (referer: string): Promise<Response | null> => {
  mount(
    "save",
    serverRpc<FormData, null>(
      { id: "save" },
      { validator: "unchecked", middleware: [], handler: () => null },
    ),
  );
  return handleServerFn(
    new Request(`${ORIGIN}${RPC_PREFIX}save`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: ORIGIN,
        referer,
      },
      body: "a=1",
    }),
  );
};

// Same origin as far as `new URL(referer).origin` can tell, and a path a
// browser reads as another host once it is written into `Location` alone.
for (const [shape, path] of [
  ["two slashes", "//evil.example.com/landing"],
  ["a backslash", "/\\evil.example.com/landing"],
] as const) {
  test(`the form redirect stays on this origin when the Referer path opens with ${shape}`, async () => {
    const response = await submitFrom(`${ORIGIN}${path}`);
    expect(response?.status).toBe(303);
    const location = response?.headers.get("location") ?? "";
    expect(new URL(location, ORIGIN).origin).toBe(ORIGIN);
  });
}
