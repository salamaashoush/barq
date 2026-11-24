/**
 * Engine exports barq passes through under Solid 2.0's names, checked against
 * barq's own renderer where the two meet.
 */

import { afterEach, describe, expect, test } from "bun:test";

import {
  $PROXY,
  configureClientErrors,
  createStore,
  flush,
  markRaw,
  type ClientErrorContext,
  type JSXElement,
} from "@barqjs/core";
import { render } from "./index.ts";
import { compileModule } from "./test-compile.ts";

afterEach(() => {
  configureClientErrors({});
  document.body.textContent = "";
});

interface HeardError {
  error: unknown;
  context: ClientErrorContext;
}

interface BoomModule {
  App: (props: object) => JSXElement;
  boom: Error;
}

describe("configureClientErrors", () => {
  test("hears an error barq's <Errored> caught and rendered a fallback for", async () => {
    const heard: HeardError[] = [];
    configureClientErrors({ onError: (error, context) => heard.push({ error, context }) });

    const view = await compileModule<BoomModule>(
      `import { Errored } from "@barqjs/core";
       export const boom = new Error("salama's profile failed to load");
       function Profile() { throw boom; }
       export const App = () => (
         <Errored fallback={(error) => <p>failed: {error().message}</p>}>
           <Profile />
         </Errored>
       );`,
      "client-errors",
    );
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => view.App({}), host);
    flush();

    expect(host.textContent).toBe("failed: salama's profile failed to load");
    expect(heard).toHaveLength(1);
    expect(heard[0]?.error).toBe(view.boom);
    dispose();
  });
});

describe("markRaw", () => {
  test("keeps an object out of a store's proxying", () => {
    const client = markRaw({ endpoint: "https://example.com" });
    const [store] = createStore({ client, plain: { endpoint: "https://example.com" } });
    expect(store.client).toBe(client);
    expect((store.plain as Record<symbol, unknown>)[$PROXY]).toBeDefined();
    expect((store.client as Record<symbol, unknown>)[$PROXY]).toBeUndefined();
  });
});
