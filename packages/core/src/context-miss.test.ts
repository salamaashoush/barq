/**
 * A context read with no provider says WHICH context.
 *
 * The engine's `ContextNotFoundError` carries one message for every context,
 * so in an application with a dozen providers the throw names none of them. The
 * description `createContext` is given is the only thing that can.
 */

import { describe, expect, test } from "bun:test";

import { ContextNotFoundError, createContext, createRoot, read, useContext } from "./index.ts";

function thrownBy(body: () => unknown): unknown {
  try {
    createRoot((dispose) => {
      try {
        body();
      } finally {
        dispose();
      }
    });
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("a context miss", () => {
  test("useContext names the context it could not find", () => {
    const Theme = createContext<string>(undefined, "theme");
    const error = thrownBy(() => useContext(Theme));
    expect(error).toBeInstanceOf(ContextNotFoundError);
    expect((error as Error).message).toStartWith(
      "The context `theme` was read with no provider above the component that reads it, so " +
        "there is no value to return. Wrap that component in the context, as in " +
        "`<Theme value={…}>`, or give `createContext` a default value. ",
    );
  });

  test("read names it too", () => {
    const Session = createContext<string>(undefined, "session");
    const error = thrownBy(() => read(Session));
    expect(error).toBeInstanceOf(ContextNotFoundError);
    expect((error as Error).message).toStartWith(
      "The context `session` was read with no provider above the component that reads it",
    );
  });

  test("a context created without a description keeps the engine's message", () => {
    const Anonymous = createContext<string>();
    const error = thrownBy(() => useContext(Anonymous));
    expect(error).toBeInstanceOf(ContextNotFoundError);
    expect((error as Error).message).toBe(new ContextNotFoundError().message);
  });
});
