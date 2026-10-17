import { afterEach, beforeEach, expect, test } from "bun:test";
import { insert } from "./dom.ts";
import { boundary, portal } from "./dom-flow.ts";
import { block, createMemo, createSignal, flush, rootScope, runWithOwner } from "@barqjs/core";

let host: HTMLDivElement;
let target: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  target = document.createElement("section");
  document.body.append(host, target);
});

afterEach(() => {
  host.remove();
  target.remove();
});

function mount(build: () => void): void {
  runWithOwner(rootScope(), build);
  flush();
}

function tagged(tag: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

const turn = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

test("a portal inside a boundary that was pending when it was built mounts once the content shows", async () => {
  let arrive!: (value: string) => void;
  mount(() => {
    const report = createMemo(
      () =>
        new Promise<string>((resolve) => {
          arrive = resolve;
        }),
    );
    boundary(
      host,
      null,
      "loading",
      block(() => tagged("p", "loading")),
      block(() => {
        const card = document.createElement("div");
        insert(card, () => report());
        insert(
          card,
          portal(
            () => target,
            block(() => tagged("b", "dialog")),
          ),
        );
        return card;
      }),
    );
  });
  await turn();
  expect(host.textContent).toBe("loading");
  expect(target.textContent).toBe("");

  arrive("ready");
  await turn();
  flush();
  await turn();
  expect(host.textContent).toBe("ready");
  expect(target.textContent).toBe("dialog");
});

test("a portal whose target moves before its first mount mounts once, at the last target", async () => {
  const [mountPoint, setMountPoint] = createSignal<Node | undefined>(undefined);
  const before = document.body.childNodes.length;
  mount(() => {
    insert(
      host,
      portal(
        () => mountPoint(),
        block(() => tagged("b", "dialog")),
      ),
    );
  });
  setMountPoint(target);
  flush();
  await turn();

  expect(target.textContent).toBe("dialog");
  expect(document.body.childNodes.length).toBe(before);
  expect(document.querySelectorAll("b").length).toBe(1);
});
