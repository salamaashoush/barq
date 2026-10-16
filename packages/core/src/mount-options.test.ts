import { describe, expect, test } from "bun:test";

import {
  createContext,
  createRoot,
  createUniqueId,
  element,
  getOwner,
  onCleanup,
  provide,
  read,
  render,
} from "./index.ts";

describe("render's options", () => {
  test("owner parents the root: the tree reads its contexts and goes with it", () => {
    const Account = createContext("nobody");
    const host = document.createElement("div");
    let seen = "";
    let cleaned = false;
    let disposeOwner!: () => void;
    createRoot((dispose) => {
      disposeOwner = dispose;
      provide(
        Account,
        () => "salama",
        () => {
          const owner = getOwner();
          render(
            () => {
              seen = read(Account)();
              onCleanup(() => {
                cleaned = true;
              });
              return element("p", { children: "mounted" });
            },
            host,
            { owner },
          );
        },
      );
    });

    expect(seen).toBe("salama");
    expect(host.textContent).toBe("mounted");
    disposeOwner();
    expect(cleaned).toBe(true);
  });

  test("mounts into a shadow root", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const dispose = render(() => element("b", { children: "salama" }), shadow);

    expect(shadow.querySelector("b")?.textContent).toBe("salama");
    dispose();
    expect(shadow.childNodes).toHaveLength(0);
    host.remove();
  });

  test("renderId namespaces the ids a root numbers", () => {
    const ids: string[] = [];
    for (const renderId of ["first-", "second-", "first-"]) {
      const dispose = render(
        () => {
          ids.push(createUniqueId());
          return element("i", {});
        },
        document.createElement("div"),
        { renderId },
      );
      dispose();
    }

    expect(ids[0]?.startsWith("barq-first-")).toBe(true);
    expect(ids[1]?.startsWith("barq-second-")).toBe(true);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
