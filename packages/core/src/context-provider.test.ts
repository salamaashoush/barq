/**
 * A context is its own provider component (Solid 2.0): `<Theme value="dark">`.
 * Compiled through the real compiler, which calls a tag as `Comp(props)`.
 */

import { afterEach, describe, expect, test } from "bun:test";

import {
  ContextNotFoundError,
  createContext,
  createRoot,
  flush,
  render,
  useContext,
  type JSXElement,
} from "./index.ts";
import { compileModule } from "./test-compile.ts";

const host = (): HTMLElement => {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
};

afterEach(() => {
  document.body.textContent = "";
});

type View = Record<string, (props: object) => JSXElement> & {
  [key: string]: unknown;
};

describe("a context as its own provider", () => {
  test("is a function with no `.Provider` beside it", () => {
    const Theme = createContext("light", "theme");
    expect(typeof Theme).toBe("function");
    expect("Provider" in Theme).toBe(false);
    expect(Theme.defaultValue).toBe("light");
    expect(Theme.id.description).toBe("theme");
  });

  test("takes Solid's `{ name }` as well as a description string", () => {
    expect(createContext(undefined, { name: "session" }).id.description).toBe("session");
  });

  test("`<Ctx value>` provides, nests and overrides, and a reader outside sees the default", async () => {
    const view = await compileModule<View>(
      `import { createContext, useContext } from "@barqjs/core";
       export const Theme = createContext("light", "theme");
       function Label() { const theme = useContext(Theme); return <b>{theme()}</b>; }
       export const App = () => (
         <main>
           <Label />
           <Theme value="dark">
             <Label />
             <Theme value="contrast"><Label /></Theme>
             <Label />
           </Theme>
         </main>
       );`,
      "context-nest",
    );
    const element = host();
    const dispose = render(() => view.App({}), element);
    flush();
    expect([...element.querySelectorAll("b")].map((b) => b.textContent)).toEqual([
      "light",
      "dark",
      "contrast",
      "dark",
    ]);
    dispose();
  });

  test("a signal given as `value` stays live", async () => {
    const view = await compileModule<View & { setName: (name: string) => void }>(
      `import { createContext, createSignal, useContext } from "@barqjs/core";
       const User = createContext<string>(undefined, "user");
       const [name, setName] = createSignal("salama");
       export { setName };
       function Greeting() { const user = useContext(User); return <p>{user()}</p>; }
       export const App = () => <User value={name()}><Greeting /></User>;`,
      "context-live",
    );
    const element = host();
    const dispose = render(() => view.App({}), element);
    flush();
    expect(element.textContent).toBe("salama");
    view.setName("salama ashoush");
    flush();
    expect(element.textContent).toBe("salama ashoush");
    dispose();
  });

  test("a reader with no provider and no default throws, naming the context", () => {
    const Session = createContext<string>(undefined, { name: "session" });
    let thrown: unknown;
    try {
      createRoot((dispose) => {
        try {
          useContext(Session);
        } finally {
          dispose();
        }
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ContextNotFoundError);
    expect((thrown as Error).message).toContain("`session`");
  });
});
