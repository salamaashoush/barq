/**
 * A component's frame lives exactly as long as what its body built.
 *
 * A body that throws built nothing anyone holds, so what it made before the
 * throw goes with it. A body that suspends is built again from the start, in a
 * frame of its own, so the frame of the attempt that suspended goes too, and a
 * retry does not leave one more frame behind each time.
 */

import { describe, expect, test } from "bun:test";

import {
  block,
  createComponent,
  createContext,
  createMemo,
  createRoot,
  getOwner,
  install,
  isBlock,
  onCleanup,
  useContext,
} from "@barqjs/core";
import { rooted } from "../../core/src/test-root.ts";

import { boundary } from "./dom-flow.ts";
import { insert, render } from "./dom.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("a component's frame", () => {
  test(
    "is disposed when the body throws",
    rooted(() => {
      let made = 0;
      let cleaned = 0;
      function Throws(): never {
        made++;
        onCleanup(() => cleaned++);
        throw new Error("salama");
      }
      createRoot((dispose) => {
        expect(() => createComponent(Throws, {})).toThrow("salama");
        expect(made).toBe(1);
        expect(cleaned).toBe(1);
        dispose();
      });
      expect(cleaned).toBe(1);
    }),
  );

  for (const where of ["as the body", "through a hole"] as const) {
    test(
      `of an attempt that suspended is gone once the body is built, ${where}`,
      rooted(async () => {
        let resolve!: (value: string) => void;
        const data = createMemo(() => new Promise<string>((done) => (resolve = done)));
        let made = 0;
        let cleaned = 0;
        function Pending(): Text {
          made++;
          onCleanup(() => cleaned++);
          return document.createTextNode(data());
        }
        const container = document.createElement("div");
        document.body.appendChild(container);
        let dispose!: () => void;
        createRoot((done) => {
          dispose = done;
          const placed = boundary(
            null,
            null,
            "loading",
            block(() => document.createTextNode("wait")),
            where === "as the body"
              ? block(() => createComponent(Pending, {}))
              : block(() => {
                  const paragraph = document.createElement("p");
                  insert(
                    paragraph,
                    block(() => createComponent(Pending, {})),
                  );
                  return paragraph;
                }),
            0,
          );
          render(placed, container);
        });
        await tick();
        expect(container.textContent).toBe("wait");
        // Every attempt so far suspended, and none of their frames is left.
        expect(made).toBeGreaterThan(0);
        expect(made - cleaned).toBe(0);
        resolve("salama");
        await tick();
        await tick();
        expect(container.textContent).toBe("salama");
        expect(made).toBeGreaterThan(1);
        expect(made - cleaned).toBe(1);
        dispose();
        expect(made - cleaned).toBe(0);
        container.remove();
      }),
    );
  }

  test(
    "carries a row callback it hands back as the row callback it was",
    rooted(() => {
      const Ctx = createContext("plain");
      const MARK = Symbol("salama");
      const row = block((item: string) => document.createTextNode(`${item}:${useContext(Ctx)()}`));
      (row as unknown as Record<symbol, boolean>)[MARK] = true;
      function Provides(props: { children: unknown }): unknown {
        install(getOwner()!, Ctx, () => "carried");
        return props.children;
      }
      createRoot((dispose) => {
        const handed = createComponent(Provides, { children: row }) as typeof row;
        expect(handed).not.toBe(row);
        expect(isBlock(handed)).toBe(true);
        expect(handed.length).toBe(1);
        expect((handed as unknown as Record<symbol, boolean>)[MARK]).toBe(true);
        expect(handed("a").textContent).toBe("a:carried");
        dispose();
      });
    }),
  );
});
