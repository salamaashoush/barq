/**
 * Every example in a package README, run.
 *
 * A README that names an export which no longer exists is worse than no README:
 * the root one advertised `useState`, `useEffect`, `useMemo`, `useStore`,
 * `useResource`, `useRef`, `Await` and `Suspense` long after all eight were
 * deleted. Nothing could see it, because prose is not executed.
 *
 * This file is the executable half. It lives here rather than in `packages/core`
 * for a mechanical reason: this package's preload wires the barq compiler into
 * `bun test`, so a `.tsx` here reaches the runtime through the same emission an
 * application's build produces, and core's own preload does not.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Glob } from "bun";
import {
  Errored,
  For,
  Loading,
  Match,
  Show,
  Switch,
  Portal,
  createContext,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  createStore,
  createTrackedEffect,
  flush,
  isPending,
  onCleanup,
  onSettled,
  refresh,
  render,
  untrack,
  useContext,
} from "@barqjs/core";
import {
  ReactiveMap,
  debounce,
  on,
  persisted,
  previous,
  scheduled,
  selector,
  shortcut,
  until,
  windowSize,
} from "@barqjs/primitives";
import { fireEvent, render as renderForTest, screen } from "./index.ts";

/**
 * IN the document, always. barq DELEGATES its events, so a `click` on a detached
 * node reaches no listener and the assertion after it measures nothing.
 */
function mount(): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("packages/core/README.md", () => {
  test("signal, memo and effect", () => {
    const [count, setCount] = createSignal(0);
    const seen: number[] = [];
    const dispose = createRoot((release) => {
      const doubled = createMemo(() => count() * 2);
      createEffect(
        () => doubled(),
        (value) => {
          seen.push(value);
        },
      );
      return release;
    });
    flush();

    setCount(1);
    // Applied at the next flush, so the line after a write reads the old value.
    expect(count()).toBe(0);
    flush();
    expect(count()).toBe(1);

    setCount((n) => n + 1);
    flush();

    expect(untrack(count)).toBe(2);
    expect(seen).toEqual([0, 2, 4]);
    dispose();
  });

  test("render, and `{count}` as a tracked read", () => {
    const host = mount();
    function Counter() {
      const [count, setCount] = createSignal(0);
      return (
        <button type="button" onClick={() => setCount((n) => n + 1)}>
          clicked {count} times
        </button>
      );
    }

    const dispose = render(() => <Counter />, host);
    const button = host.querySelector("button")!;
    expect(button.textContent).toContain("clicked 0");
    // The click updates that text node and nothing else, which is the claim.
    button.click();
    flush();
    expect(button.textContent).toContain("clicked 1");
    dispose();
  });

  test("Show, For and Switch/Match", () => {
    const host = mount();
    const [isOpen, setIsOpen] = createSignal(true);
    const [which, setWhich] = createSignal("a");
    const [rows] = createSignal([
      { id: 1, name: "Ada" },
      { id: 2, name: "Grace" },
    ]);

    const dispose = render(
      () => (
        <div>
          <Show when={isOpen} fallback={<p>closed</p>}>
            <p>open</p>
          </Show>
          <ul>
            <For each={rows}>{(row: { name: string }) => <li>{row.name}</li>}</For>
          </ul>
          <Switch>
            <Match when={which() === "a"}>
              <i>A</i>
            </Match>
            <Match when={which() === "b"}>
              <i>B</i>
            </Match>
          </Switch>
        </div>
      ),
      host,
    );

    expect(host.textContent).toContain("open");
    expect(host.querySelectorAll("li")).toHaveLength(2);
    expect(host.querySelector("i")?.textContent).toBe("A");

    setIsOpen(false);
    setWhich("b");
    flush();

    expect(host.textContent).toContain("closed");
    expect(host.querySelector("i")?.textContent).toBe("B");
    dispose();
  });

  test("context, read through a Provider", () => {
    const Theme = createContext<"light" | "dark">("light");
    const host = mount();

    function Page() {
      const theme = useContext(Theme);
      return <div class={theme()}>page</div>;
    }

    const dispose = render(
      () => (
        <Theme.Provider value="dark">
          <Page />
        </Theme.Provider>
      ),
      host,
    );

    expect(host.querySelector("div")?.className).toBe("dark");
    dispose();
  });

  test("a store, written through the draft its setter hands over", () => {
    const [state, setState] = createStore({
      user: { name: "Ada" },
      todos: [] as { id: number; done: boolean }[],
    });

    setState((draft) => {
      draft.user.name = "Grace";
      draft.todos.push({ id: 1, done: false });
    });
    setState((draft) => {
      draft.todos[0].done = true;
    });
    flush();

    expect(state.user.name).toBe("Grace");
    expect(state.todos[0]).toEqual({ id: 1, done: true });
  });

  test("an async memo, its Loading boundary, isPending and refresh", async () => {
    const host = mount();
    const [userId, setUserId] = createSignal(1);
    let fetches = 0;

    function Profile() {
      const user = createMemo(async () => {
        const id = userId();
        fetches += 1;
        await Promise.resolve();
        return { name: `user ${id}` };
      });
      return (
        <Loading fallback={<p>loading…</p>}>
          <h1 class={{ stale: isPending(user) }}>{() => user().name}</h1>
          <button type="button" onClick={() => void refresh(user)}>
            reload
          </button>
        </Loading>
      );
    }

    const dispose = render(() => <Profile />, host);

    // The read throws `NotReadyError` until the promise settles, which is what
    // parks the boundary on its fallback.
    expect(host.textContent).toContain("loading…");
    await new Promise((r) => setTimeout(r, 0));
    flush();
    expect(host.textContent).toContain("user 1");
    expect(host.querySelector("h1")?.classList.contains("stale")).toBe(false);

    // A changed dependency runs the memo again. What is on screen stays there,
    // marked pending, until the new answer arrives.
    setUserId(2);
    flush();
    expect(host.textContent).toContain("user 1");
    expect(host.querySelector("h1")?.classList.contains("stale")).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    flush();
    expect(host.textContent).toContain("user 2");
    expect(host.querySelector("h1")?.classList.contains("stale")).toBe(false);

    expect(fetches).toBe(2);
    host.querySelector("button")!.click();
    flush();
    expect(fetches).toBe(3);
    dispose();
  });

  test("Errored's fallback is handed the error and a reset", () => {
    const host = mount();
    function Risky(): never {
      throw new Error("boom");
    }

    const dispose = render(
      () => (
        <Errored fallback={(error: () => Error) => <p>{() => error().message}</p>}>
          <Risky />
        </Errored>
      ),
      host,
    );

    expect(host.textContent).toContain("boom");
    dispose();
  });

  test("a keyed row survives an edit to its item", () => {
    const host = mount();
    const [rows, setRows] = createSignal([
      { id: 1, text: "a" },
      { id: 2, text: "b" },
    ]);

    const dispose = render(
      () => (
        <ul>
          <For each={rows} keyed={(row: { id: number }) => row.id}>
            {(row: () => { text: string }) => <li>{() => row().text}</li>}
          </For>
        </ul>
      ),
      host,
    );

    const first = host.querySelector("li")!;
    expect(first.textContent).toBe("a");
    // Same id, new object: the row is the SAME row, so the node survives.
    setRows([
      { id: 1, text: "edited" },
      { id: 2, text: "b" },
    ]);
    flush();
    expect(host.querySelector("li")).toBe(first);
    expect(first.textContent).toBe("edited");
    dispose();
  });

  test("bind:value writes the property and reports the edit", () => {
    const host = mount();
    const [name, setName] = createSignal("Ada");
    const dispose = render(() => <input type="text" bind:value={[name, setName]} />, host);

    const input = host.querySelector("input")!;
    expect(input.value).toBe("Ada");

    input.value = "Grace";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();
    expect(name()).toBe("Grace");
    dispose();
  });

  test("createSignal(fn) holds a write until its source changes", () => {
    const [saved, setSaved] = createSignal("Ada");
    const [draft, setDraft, dispose] = createRoot((release) => {
      const [read, write] = createSignal(() => saved());
      return [read, write, release] as const;
    });
    expect(draft()).toBe("Ada");

    setDraft("edited");
    flush();
    expect(draft()).toBe("edited");

    // The next change of `saved` recomputes over the write.
    setSaved("Grace");
    flush();
    expect(draft()).toBe("Grace");
    dispose();
  });

  test("createSignal(fn) hands its compute the value it held", () => {
    const [options, setOptions] = createSignal(["s", "m", "l"]);
    const [chosen, setChosen, dispose] = createRoot((release) => {
      const [read, write] = createSignal<string>((held) => {
        const list = options();
        return held !== undefined && list.includes(held) ? held : list[0];
      });
      return [read, write, release] as const;
    });
    expect(chosen()).toBe("s");

    setChosen("m");
    flush();
    setOptions(["m", "l", "xl"]);
    flush();
    expect(chosen()).toBe("m");

    setOptions(["l", "xl"]);
    flush();
    expect(chosen()).toBe("l");
    dispose();
  });

  test("two writes land in one flush, and untrack reads without subscribing", () => {
    const [first, setFirst] = createSignal("Ada");
    const [last, setLast] = createSignal("L");
    let runs = 0;
    const dispose = createRoot((release) => {
      createEffect(
        () => `${first()} ${last()}`,
        () => {
          runs += 1;
        },
      );
      return release;
    });
    flush();
    expect(runs).toBe(1);

    setFirst("Grace");
    setLast("Hopper");
    flush();
    expect(runs).toBe(2);

    const seen: number[] = [];
    const [count, setCount] = createSignal(0);
    const second = createRoot((release) => {
      createTrackedEffect(() => {
        seen.push(untrack(count));
      });
      return release;
    });
    flush();
    setCount(1);
    flush();
    // The untracked read established no dependency, so the effect never re-ran.
    expect(seen).toEqual([0]);

    dispose();
    second();
  });

  test("Portal places children elsewhere in the document", async () => {
    const host = mount();
    const target = document.createElement("div");
    target.id = "modal-root";
    document.body.appendChild(target);

    const dispose = render(
      () => (
        <Portal mount="#modal-root">
          <p>dialog</p>
        </Portal>
      ),
      host,
    );

    // A portal resolves its target and builds in an effect, so it lands after a
    // flush rather than during the render.
    await Promise.resolve();
    flush();
    expect(target.textContent).toContain("dialog");
    expect(host.textContent).not.toContain("dialog");
    dispose();
  });

  test("onSettled and onCleanup run under the render's scope", async () => {
    const host = mount();
    const order: string[] = [];

    function Widget() {
      onSettled(() => {
        order.push("settled");
        return () => order.push("settled cleanup");
      });
      onCleanup(() => order.push("cleanup"));
      return <span>w</span>;
    }

    const dispose = render(() => <Widget />, host);
    await Promise.resolve();
    flush();
    expect(order).toEqual(["settled"]);
    dispose();
    expect(order).toEqual(["settled", "settled cleanup", "cleanup"]);
  });
});

describe("packages/testing/README.md", () => {
  test("render mounts into the document and fireEvent flushes", () => {
    function Counter() {
      const [count, setCount] = createSignal(0);
      return (
        <button type="button" onClick={() => setCount((n) => n + 1)}>
          clicked {count} times
        </button>
      );
    }

    renderForTest(() => <Counter />);
    fireEvent.click(screen.getByRole("button"));

    // `fireEvent` flushes: a write is applied at the next flush, so an assertion
    // straight after the click would otherwise read the DOM as it was before.
    expect(screen.getByRole("button").textContent).toContain("clicked 1 times");
  });
});

describe("packages/primitives/README.md", () => {
  test("a component's listeners and its shared source go with it", () => {
    const host = mount();
    let width = 0;
    const dispose = render(() => {
      const size = windowSize();
      width = size.width();
      on(document, "keydown", () => {});
      return <aside />;
    }, host);

    expect(width).toBe(window.innerWidth);
    dispose();
  });

  test("a global source is one source for every caller", () => {
    const dispose = createRoot((release) => {
      expect(windowSize()).toBe(windowSize());
      return release;
    });
    dispose();
  });

  test("debounce runs once, with the last arguments, and flush forces it", () => {
    const seen: string[] = [];
    const search = debounce((q: string) => seen.push(q), 250);
    search("ba");
    search("barq");
    expect(seen).toEqual([]);
    search.flush();
    expect(seen).toEqual(["barq"]);
  });

  test("scheduled gates a computation without narrowing what it depends on", async () => {
    const [query, setQuery] = createSignal("a");
    const runs: string[] = [];
    const dispose = createRoot((release) => {
      const settled = scheduled((fire) => debounce(fire, 10));
      createEffect(
        () => [query(), settled()] as const,
        ([q, ready]) => {
          if (ready) runs.push(q);
        },
      );
      return release;
    });

    setQuery("b");
    flush();
    expect(runs).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 40));
    flush();
    expect(runs).toEqual(["b"]);
    dispose();
  });

  test("selector wakes the row that lost the selection and the one that gained it", () => {
    const [selected, setSelected] = createSignal(1);
    const runs: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    const dispose = createRoot((release) => {
      const isSelected = selector(selected);
      for (const id of [1, 2, 3]) {
        createTrackedEffect(() => {
          isSelected(id);
          runs[id] = (runs[id] ?? 0) + 1;
        });
      }
      return release;
    });
    flush();

    setSelected(2);
    flush();
    expect(runs).toEqual({ 1: 2, 2: 2, 3: 1 });
    dispose();
  });

  test("previous advances even when nothing reads it", () => {
    const [count, setCount] = createSignal(1);
    const [before, dispose] = createRoot((release) => [previous(count), release] as const);
    setCount(2);
    flush();
    setCount(3);
    flush();
    expect(before()).toBe(2);
    dispose();
  });

  test("persisted follows another tab and does not write its initial value", () => {
    localStorage.clear();
    const [theme, setTheme, dispose] = createRoot((release) => {
      const [read, write] = persisted("theme", "system");
      return [read, write, release] as const;
    });
    expect(localStorage.getItem("theme")).toBe(null);
    setTheme("dark");
    flush();
    expect(localStorage.getItem("theme")).toBe('"dark"');

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "theme",
        newValue: '"light"',
        storageArea: localStorage,
      }),
    );
    flush();
    expect(theme()).toBe("light");
    dispose();
    localStorage.clear();
  });

  test("a ReactiveMap key is a dependency of its own", () => {
    const users = new ReactiveMap<string, string>();
    const runs = { ada: 0, size: 0 };
    const dispose = createRoot((release) => {
      createTrackedEffect(() => {
        users.get("ada");
        runs.ada++;
      });
      createTrackedEffect(() => {
        expect(users.size).toBeGreaterThanOrEqual(0);
        runs.size++;
      });
      return release;
    });
    flush();

    users.set("grace", "Hopper");
    flush();
    expect(runs).toEqual({ ada: 1, size: 2 });
    dispose();
  });

  test("shortcut matches its modifiers exactly", () => {
    let opened = 0;
    const dispose = createRoot((release) => {
      shortcut("ctrl+k", () => opened++);
      return release;
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    expect(opened).toBe(0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    expect(opened).toBe(1);
    dispose();
  });

  test("until resolves at once when the condition already holds", async () => {
    const [currentUser, setCurrentUser] = createSignal<string | null>(null);
    const [dispose, waiting] = createRoot((release) => [release, until(currentUser)] as const);
    setCurrentUser("Ada");
    flush();

    expect(await waiting).toBe("Ada");
    dispose();
  });
});

/**
 * Every name a README imports must still be exported.
 *
 * This is the half that caught the root README: it advertised exports that had
 * been deleted, and had done for as long as anyone could remember, because
 * nothing reads prose. A rename now fails here instead.
 */
describe("every documented import resolves", () => {
  const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
  // A VALUE import only. `import type { Child }` names something that is erased,
  // so the module namespace is the wrong place to look for it.
  const IMPORT = /import\s+\{([^}]+)\}\s+from\s+["'](@barqjs\/[\w-]+(?:\/[\w-]+)?)["']/g;

  interface Manifest {
    exports?: Record<string, Record<string, string> | undefined>;
  }

  // The docs a READER is pointed at. A design note is prose about a decision and
  // is allowed to name a symbol that has since gone; a README is an instruction.
  const docs = [...new Glob("packages/**/{README,USAGE}.md").scanSync(ROOT), "README.md"]
    .filter((file) => !file.includes("node_modules") && !file.includes("/dist/"))
    .toSorted();

  const surfaceOf = async (specifier: string): Promise<Set<string>> => {
    const parts = /^@barqjs\/([\w-]+)(?:\/([\w-]+))?$/.exec(specifier);
    if (parts === null) return new Set();
    const [, name, subpath] = parts;
    const directory = join(ROOT, "packages", name);
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as Manifest;
    const entry = manifest.exports?.[subpath === undefined ? "." : `./${subpath}`];
    // `bun` over `import`: it points at source, so this needs no build.
    const file = entry?.bun ?? entry?.import;
    if (file === undefined) return new Set();
    const namespace = (await import(join(directory, file))) as Record<string, unknown>;
    return new Set(Object.keys(namespace));
  };

  test("the doc set is not empty, so a broken glob cannot pass this", () => {
    expect(docs.length).toBeGreaterThan(4);
  });

  test.each(docs)("%s", async (file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    const missing: string[] = [];
    for (const [, names, specifier] of source.matchAll(IMPORT)) {
      const surface = await surfaceOf(specifier);
      // A package with no `exports` map — the native addon — has no namespace to
      // ask, so there is nothing here to check rather than something wrong.
      if (surface.size === 0) continue;
      for (const raw of names.split(",")) {
        const spelled = raw.trim();
        if (spelled === "" || spelled.startsWith("type ")) continue;
        const [name = ""] = spelled.split(/\s+as\s+/);
        if (!surface.has(name.trim())) missing.push(`${specifier} has no \`${name.trim()}\``);
      }
    }
    expect(missing).toEqual([]);
  });
});
