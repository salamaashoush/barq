/**
 * Sessions, and the properties that make a sealed cookie worth trusting.
 *
 * The interesting tests are not "it round-trips" — they are the ones that check
 * a tampered, re-keyed, expired or forged cookie comes back as NOT SIGNED IN
 * rather than as an error, an exception, or somebody else's session.
 */

import { describe, expect, test } from "bun:test";

import {
  type SessionConfig,
  clearSession,
  sealSession,
  unsealSession,
  useSession,
} from "./session.ts";
import { applyResponseDraft, createResponseDraft, withRequest } from "./context.ts";
import { parseCookies } from "./cookies.ts";

const PASSWORD = "0123456789abcdef0123456789abcdef";
const CONFIG: SessionConfig = { password: PASSWORD, cookie: { secure: false } };

/** One request, with whatever cookies it carried, returning what it set. */
async function inRequest<T>(
  body: () => Promise<T>,
  cookie?: string,
): Promise<{ value: T; setCookie: string[] }> {
  const draft = createResponseDraft();
  const headers = new Headers();
  if (cookie !== undefined) headers.set("cookie", cookie);
  const value = await withRequest(new Request("http://x/", { headers }), body, {
    response: draft,
  });
  const response = applyResponseDraft(new Response(null), draft);
  return { value, setCookie: response.headers.getSetCookie() };
}

/** The `name=value` a `Set-Cookie` line carries, for feeding back in. */
const asRequestCookie = (line: string): string => line.split(";")[0] ?? "";

describe("a session round-trips through the cookie", () => {
  test("a visitor with no cookie gets an empty session, not null", async () => {
    // The branch that is easy to get backwards does not exist.
    const { value, setCookie } = await inRequest(async () => {
      const session = await useSession(CONFIG);
      return { id: session.id, data: session.data };
    });
    expect(value.data).toEqual({});
    expect(typeof value.id).toBe("string");
    // …and READING one writes nothing. Re-issuing on every render would refresh
    // an expiry the user did not earn, and on a publicly cached page that
    // `Set-Cookie` is a poisoning waiting to happen.
    expect(setCookie).toEqual([]);
  });

  test("`update` seals it, and the next request opens it", async () => {
    const first = await inRequest(async () => {
      await (await useSession<{ userId: number }>(CONFIG)).update({ userId: 7 });
    });
    expect(first.setCookie).toHaveLength(1);
    const line = first.setCookie[0] ?? "";
    expect(line).toContain("HttpOnly");
    expect(line).toContain("SameSite=Lax");
    expect(line).toContain("Path=/");

    const second = await inRequest(
      async () => (await useSession<{ userId: number }>(CONFIG)).data,
      asRequestCookie(line),
    );
    expect(second.value).toEqual({ userId: 7 });
  });

  test("the sealed value is opaque — the client cannot read it", async () => {
    const { setCookie } = await inRequest(async () => {
      await (await useSession<{ email: string }>(CONFIG)).update({ email: "ada@example.com" });
    });
    const value = parseCookies(asRequestCookie(setCookie[0] ?? ""))["barq-session"] ?? "";
    expect(value).not.toContain("ada@example.com");
    expect(value).not.toContain("email");
    // Our envelope, and it says which version it is so a later one can refuse.
    expect(value.startsWith("b1.")).toBe(true);
  });

  test("`update` MERGES, and the functional form sees the current data", async () => {
    const first = await inRequest(async () => {
      await (await useSession<{ a: number; b: number }>(CONFIG)).update({ a: 1 });
    });
    const second = await inRequest(
      async () => {
        const session = await useSession<{ a: number; b: number }>(CONFIG);
        const next = await session.update((current) => ({ b: (current.a ?? 0) + 1 }));
        return next.data;
      },
      asRequestCookie(first.setCookie[0] ?? ""),
    );
    expect(second.value).toEqual({ a: 1, b: 2 });
  });

  test("`clear` expires the cookie rather than sealing an empty one", async () => {
    // An empty session cookie is still a cookie the browser sends back.
    const first = await inRequest(async () => {
      await (await useSession<{ a: number }>(CONFIG)).update({ a: 1 });
    });
    const cleared = await inRequest(
      async () => clearSession(CONFIG),
      asRequestCookie(first.setCookie[0] ?? ""),
    );
    const line = cleared.setCookie[0] ?? "";
    expect(line).toContain("Max-Age=0");
    expect(line).toContain("Expires=Thu, 01 Jan 1970");
  });

  test("the id survives an update and changes on a clear", async () => {
    const first = await inRequest(async () => {
      const session = await useSession<{ a: number }>(CONFIG);
      const next = await session.update({ a: 1 });
      return { before: session.id, after: next.id };
    });
    expect(first.value.after).toBe(first.value.before);

    const cleared = await inRequest(
      async () => {
        const session = await useSession<{ a: number }>(CONFIG);
        return { before: session.id, after: (await session.clear()).id };
      },
      asRequestCookie(first.setCookie[0] ?? ""),
    );
    expect(cleared.value.after).not.toBe(cleared.value.before);
  });
});

/**
 * Every one of these must read as NOT SIGNED IN. A forged cookie and an absent
 * one have to be indistinguishable to the caller, or the difference is an oracle.
 */
describe("a cookie that will not open is a visitor who is not signed in", () => {
  const sealedWith = async (config: SessionConfig) =>
    sealSession(config, { id: "abc", createdAt: Date.now(), data: { userId: 7 } });

  test("a different password does not open it", async () => {
    const sealed = await sealedWith(CONFIG);
    const other = { password: "ffffffffffffffffffffffffffffffff" };
    expect(await unsealSession(other, sealed)).toBeNull();
  });

  test("a TAMPERED ciphertext does not open it — this is what AEAD buys", async () => {
    const sealed = await sealedWith(CONFIG);
    const parts = sealed.split(".");
    const body = parts[3] ?? "";
    // One character of the ciphertext, flipped. Without authentication this
    // would decrypt to something, and "something" is an attacker's payload.
    const flipped = `${body.slice(0, -1)}${body.at(-1) === "A" ? "B" : "A"}`;
    expect(await unsealSession(CONFIG, [...parts.slice(0, 3), flipped].join("."))).toBeNull();
  });

  test("a salt or IV from another seal does not open it", async () => {
    const one = (await sealedWith(CONFIG)).split(".");
    const two = (await sealedWith(CONFIG)).split(".");
    expect(await unsealSession(CONFIG, [one[0], two[1], one[2], one[3]].join("."))).toBeNull();
    expect(await unsealSession(CONFIG, [one[0], one[1], two[2], one[3]].join("."))).toBeNull();
  });

  test("nonsense does not open it, and does not throw either", async () => {
    for (const bad of ["", "nonsense", "b1.a.b", "b1.a.b.c", "b2.a.b.c", "....."]) {
      expect(await unsealSession(CONFIG, bad)).toBeNull();
    }
  });

  /**
   * The cookie's own expiry is a REQUEST the client is free to ignore. The
   * timestamp inside the sealed payload cannot be edited without breaking the
   * tag, so it is the one that decides.
   */
  test("an EXPIRED session does not open, however long the cookie lived", async () => {
    const config = { ...CONFIG, maxAge: 60 };
    const stale = await sealSession(config, {
      id: "abc",
      createdAt: Date.now() - 61_000,
      data: { userId: 7 },
    });
    expect(await unsealSession(config, stale)).toBeNull();

    const fresh = await sealSession(config, {
      id: "abc",
      createdAt: Date.now() - 30_000,
      data: { userId: 7 },
    });
    expect((await unsealSession(config, fresh))?.data).toEqual({ userId: 7 });
  });

  test("a session that will not open is an EMPTY session, not an error", async () => {
    const { value } = await inRequest(
      async () => (await useSession<{ userId: number }>(CONFIG)).data,
      "barq-session=b1.forged.forged.forged",
    );
    expect(value).toEqual({});
  });
});

describe("the password is a key, not a passphrase", () => {
  test("a short one is refused, with the length in the message", async () => {
    await expect(useSession({ password: "short" })).rejects.toThrow(/at least 32 characters/);
    await expect(
      sealSession({ password: "short" }, { id: "a", createdAt: 0, data: {} }),
    ).rejects.toThrow(/at least 32 characters/);
  });

  test("two seals of the same data differ, because the salt and IV are fresh", async () => {
    // Otherwise two users with the same session data carry the same cookie, and
    // an observer can tell they match.
    const payload = { id: "abc", createdAt: 1, data: { userId: 7 } };
    expect(await sealSession(CONFIG, payload)).not.toBe(await sealSession(CONFIG, payload));
  });
});
