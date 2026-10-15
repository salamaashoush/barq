import { afterEach, describe, expect, test } from "bun:test";
import { createRenderEffect, createRoot, flush } from "@barqjs/core";
import { Store } from "@tanstack/store";

import { createForm, useSelector, useStore } from "./index.ts";
import { mount, type } from "./test-helpers.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useSelector mirrors a slice of a store", () => {
  test("a reader is woken by its own slice and by nothing else", () => {
    const store = new Store({ count: 0, label: "a" });
    const seen: number[] = [];
    const dispose = createRoot((disposeRoot) => {
      const count = useSelector(store, (state) => state.count);
      createRenderEffect(count, (value) => {
        seen.push(value);
      });
      return disposeRoot;
    });
    flush();
    expect(seen).toEqual([0]);

    store.setState((state) => ({ ...state, label: "b" }));
    flush();
    expect(seen).toEqual([0]);

    store.setState((state) => ({ ...state, count: 1 }));
    flush();
    expect(seen).toEqual([0, 1]);
    dispose();
  });

  test("a selection rebuilt on every change is compared structurally", () => {
    const store = new Store({ first: "salama", last: "a", visits: 0 });
    let runs = 0;
    const dispose = createRoot((disposeRoot) => {
      const name = useSelector(store, (state) => ({ first: state.first, last: state.last }));
      createRenderEffect(name, () => {
        runs += 1;
      });
      return disposeRoot;
    });
    flush();
    expect(runs).toBe(1);

    store.setState((state) => ({ ...state, visits: state.visits + 1 }));
    flush();
    expect(runs).toBe(1);

    store.setState((state) => ({ ...state, last: "b" }));
    flush();
    expect(runs).toBe(2);
    dispose();
  });

  test("a custom comparison decides what counts as a change", () => {
    const store = new Store({ value: 1.01 });
    let runs = 0;
    const dispose = createRoot((disposeRoot) => {
      const rounded = useSelector(store, (state) => state.value, {
        compare: (a, b) => Math.round(a) === Math.round(b),
      });
      const viaAlias = useStore(
        store,
        (state) => state.value,
        (a, b) => Math.round(a) === Math.round(b),
      );
      createRenderEffect(
        () => rounded() + viaAlias(),
        () => {
          runs += 1;
        },
      );
      return disposeRoot;
    });
    flush();
    store.setState(() => ({ value: 1.4 }));
    flush();
    expect(runs).toBe(1);
    store.setState(() => ({ value: 1.6 }));
    flush();
    expect(runs).toBe(2);
    dispose();
  });

  test("the accessor answers with the store's value before any flush", () => {
    const store = new Store({ count: 0 });
    createRoot((dispose) => {
      const count = useSelector(store, (state) => state.count);
      store.setState(() => ({ count: 5 }));
      expect(count()).toBe(5);
      dispose();
    });
  });

  test("a selected function is returned as it is", () => {
    const greet = (): string => "hello salama";
    const store = new Store({ greet });
    createRoot((dispose) => {
      const selected = useSelector(store, (state) => state.greet);
      expect(selected()).toBe(greet);
      dispose();
    });
  });

  test("disposing the owner unsubscribes", () => {
    const store = new Store({ count: 0 });
    let selections = 0;
    const dispose = createRoot((disposeRoot) => {
      useSelector(store, (state) => {
        selections += 1;
        return state.count;
      });
      return disposeRoot;
    });
    store.setState(() => ({ count: 1 }));
    const whileAlive = selections;
    expect(whileAlive).toBe(2);

    dispose();
    store.setState(() => ({ count: 2 }));
    expect(selections).toBe(whileAlive);
  });
});

describe("a form re-renders only what read the slice that changed", () => {
  test("typing in one field leaves the other field's bindings alone", () => {
    const reads = { name: 0, email: 0, canSubmit: 0, names: 0 };
    const count = <T,>(key: keyof typeof reads, value: T): T => {
      reads[key] += 1;
      return value;
    };

    const view = mount(() => {
      const form = createForm(() => ({
        defaultValues: { name: "salama", email: "salama@example.com" },
      }));
      const name = form.useStore((state) => state.values.name);
      return (
        <div>
          <form.Field name="name">
            {(field) => (
              <label>
                <input
                  id="name"
                  value={field().state.value}
                  onInput={(event) => field().handleChange(event.currentTarget.value)}
                />
                <span id="name-text">{count("name", field().state.value)}</span>
              </label>
            )}
          </form.Field>
          <form.Field name="email">
            {(field) => (
              <label>
                <input
                  id="email"
                  value={field().state.value}
                  onInput={(event) => field().handleChange(event.currentTarget.value)}
                />
                <span id="email-text">{count("email", field().state.value)}</span>
              </label>
            )}
          </form.Field>
          <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit })}>
            {(state) => <span id="can">{count("canSubmit", `${state().canSubmit}`)}</span>}
          </form.Subscribe>
          <span id="hello">{count("names", `hello ${name()}`)}</span>
        </div>
      );
    });

    expect(reads).toEqual({ name: 1, email: 1, canSubmit: 1, names: 1 });

    type(view.input("#email"), "s@example.com");
    type(view.input("#email"), "sa@example.com");
    expect(view.text("#email-text")).toBe("sa@example.com");
    expect(reads).toEqual({ name: 1, email: 3, canSubmit: 1, names: 1 });

    type(view.input("#name"), "sal");
    expect(view.text("#name-text")).toBe("sal");
    expect(view.text("#hello")).toBe("hello sal");
    expect(reads).toEqual({ name: 2, email: 3, canSubmit: 1, names: 2 });
    view.dispose();
  });

  test("Subscribe without a selector hands over the whole state", () => {
    const view = mount(() => {
      const form = createForm(() => ({ defaultValues: { name: "salama" } }));
      return (
        <div>
          <form.Field name="name">
            {(field) => (
              <input
                id="name"
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
              />
            )}
          </form.Field>
          <form.Subscribe>
            {(state) => <span id="state">{`${state().values.name}:${state().isDirty}`}</span>}
          </form.Subscribe>
        </div>
      );
    });

    expect(view.text("#state")).toBe("salama:false");
    type(view.input("#name"), "sal");
    expect(view.text("#state")).toBe("sal:true");
    view.dispose();
  });
});
