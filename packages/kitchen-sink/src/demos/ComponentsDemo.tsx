/**
 * Components Demo
 * Tests: Show, For (both keying modes), Switch, Match, Portal, Fragment, Errored
 *
 * NOTE: This file uses clean syntax that the compiler transforms:
 * - Control flow: `when={visible}` instead of `when={() => visible()}`
 * - Children: direct JSX instead of `{() => <div>...</div>}`
 */

import { Errored, For, Match, Portal, Show, Switch, signal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Button, DemoCard, DemoSection } from "./shared";

export function ComponentsDemo() {
  return (
    <DemoSection>
      <ShowDemo />
      <ForDemo />
      <IndexDemo />
      <SwitchDemo />
      <PortalDemo />
      <ErroredDemo />
      <FragmentDemo />
    </DemoSection>
  );
}

// Show component
function ShowDemo() {
  const visible = signal(true);
  const loading = signal(false);

  return (
    <DemoCard title="Show - Conditional Rendering">
      <div class={buttonRowStyle}>
        <Button onClick={() => visible.update((v) => !v)}>Toggle Content</Button>
        <Button onClick={() => loading.update((l) => !l)}>Toggle Loading</Button>
      </div>

      <Show when={loading} fallback={null}>
        <div class={loadingStyle}>Loading...</div>
      </Show>

      <Show
        when={visible() && !loading()}
        fallback={<div class={fallbackStyle}>Content is hidden</div>}
      >
        <div class={contentStyle}>
          This content is conditionally rendered using Show.
          <br />
          Visible: {visible() ? "Yes" : "No"}
        </div>
      </Show>
    </DemoCard>
  );
}

// For component - keyed list
/** One row of the keyed list, named so the callback can say what it takes. */
interface Fruit {
  id: number;
  name: string;
}

function ForDemo() {
  const items = signal<Fruit[]>([
    { id: 1, name: "Apple" },
    { id: 2, name: "Banana" },
    { id: 3, name: "Cherry" },
  ]);
  const nextId = signal(4);

  const addItem = () => {
    const id = nextId();
    items.update((arr) => [...arr, { id, name: `Item ${id}` }]);
    nextId.update((i) => i + 1);
  };

  const removeItem = (id: number) => {
    items.update((arr) => arr.filter((item) => item.id !== id));
  };

  const shuffleItems = () => {
    items.update((arr) => [...arr].sort(() => Math.random() - 0.5));
  };

  return (
    <DemoCard title="For - Keyed List Rendering">
      <div class={buttonRowStyle}>
        <Button onClick={addItem}>Add Item</Button>
        <Button onClick={shuffleItems}>Shuffle</Button>
      </div>

      <Show when={items().length === 0}>
        <div class={emptyStyle}>No items. Add some!</div>
      </Show>

      <ul class={listStyle}>
        <For each={items}>
          {(item: Fruit, index: () => number) => (
            <li class={listItemStyle}>
              <span>
                {index() + 1}. {item.name} (id: {item.id})
              </span>
              <button type="button" class={removeButtonStyle} onClick={() => removeItem(item.id)}>
                Remove
              </button>
            </li>
          )}
        </For>
      </ul>

      <p class={noteStyle}>
        For uses keyed reconciliation - items maintain identity when reordered.
      </p>
    </DemoCard>
  );
}

// For keyed={false} - the positional mode
function IndexDemo() {
  const values = signal(["A", "B", "C", "D"]);

  const updateValue = (idx: number, value: string) => {
    values.update((arr) => {
      const newArr = [...arr];
      newArr[idx] = value;
      return newArr;
    });
  };

  const addValue = () => {
    values.update((arr) => [...arr, String.fromCharCode(65 + arr.length)]);
  };

  const removeValue = () => {
    values.update((arr) => arr.slice(0, -1));
  };

  return (
    <DemoCard title="For keyed={false} - Position-Keyed List">
      <div class={buttonRowStyle}>
        <Button onClick={addValue}>Add</Button>
        <Button onClick={removeValue}>Remove Last</Button>
      </div>

      <div class={gridStyle}>
        <For each={values} keyed={false}>
          {(value: () => string, index: number) => (
            <input
              class={indexInputStyle}
              type="text"
              value={value}
              onInput={(e: Event) => updateValue(index, (e.target as HTMLInputElement).value)}
              placeholder={`Index ${index}`}
            />
          )}
        </For>
      </div>

      <p class={noteStyle}>
        The positional mode keeps nodes stable - only values update when items change, and the text
        you type stays with the SLOT rather than with the item (BARQ011).
      </p>
    </DemoCard>
  );
}

// Switch/Match component
function SwitchDemo() {
  const status = signal<"idle" | "loading" | "success" | "error">("idle");

  return (
    <DemoCard title="Switch/Match - Pattern Matching">
      <div class={buttonRowStyle}>
        <Button onClick={() => status.set("idle")}>Idle</Button>
        <Button onClick={() => status.set("loading")}>Loading</Button>
        <Button onClick={() => status.set("success")}>Success</Button>
        <Button onClick={() => status.set("error")}>Error</Button>
      </div>

      <div class={statusBoxStyle}>
        <Switch fallback={<span>Unknown status</span>}>
          <Match when={status() === "idle"}>
            <span class={idleStyle}>Idle - Ready to start</span>
          </Match>
          <Match when={status() === "loading"}>
            <span class={loadingTextStyle}>Loading...</span>
          </Match>
          <Match when={status() === "success"}>
            <span class={successStyle}>Success! Operation completed.</span>
          </Match>
          <Match when={status() === "error"}>
            <span class={errorStyle}>Error! Something went wrong.</span>
          </Match>
        </Switch>
      </div>

      <p>
        Current status: <code>{status()}</code>
      </p>
    </DemoCard>
  );
}

// Portal component
function PortalDemo() {
  const showModal = signal(false);

  const closeModal = () => {
    showModal.set(false);
  };

  return (
    <DemoCard title="Portal - Render Outside DOM Tree">
      <Button onClick={() => showModal.set(true)}>Open Modal</Button>

      <Show when={showModal}>
        <Portal>
          <div
            class={overlayStyle}
            onClick={closeModal}
            onKeyDown={(e: KeyboardEvent) => e.key === "Escape" && closeModal()}
            role="dialog"
            aria-modal="true"
          >
            <div class={modalStyle} onClick={(e: MouseEvent) => e.stopPropagation()}>
              <h3>Modal Title</h3>
              <p>This modal is rendered via Portal to document.body</p>
              <button type="button" class={closeButtonStyle} onClick={closeModal}>
                Close Modal
              </button>
            </div>
          </div>
        </Portal>
      </Show>

      <p class={noteStyle}>Portal renders children outside the current DOM hierarchy.</p>
    </DemoCard>
  );
}

// Errored component
function ErroredDemo() {
  const shouldError = signal(false);

  return (
    <DemoCard title="Errored - Error Handling">
      <Button onClick={() => shouldError.update((e) => !e)}>
        {shouldError() ? "Fix Component" : "Break Component"}
      </Button>

      <div class={boundaryBoxStyle}>
        <Errored
          fallback={(error: () => Error, reset: () => void) => (
            <div class={errorBoxStyle}>
              <strong>Caught Error:</strong>
              <p>{() => error().message}</p>
              <Button
                onClick={() => {
                  shouldError.set(false);
                  reset();
                }}
              >
                Reset
              </Button>
            </div>
          )}
        >
          {() => (
            <div class={contentStyle}>
              {() => {
                // The throw has to come from a TRACKED position. A body builds
                // once per activation and its reads are untracked, so a throw
                // from the body itself fires once and never again; a hole is
                // its own effect, so it re-runs when `shouldError` moves and
                // the boundary sees the throw.
                if (shouldError()) throw new Error("Intentional error for testing!");
                return "Component is working fine.";
              }}
            </div>
          )}
        </Errored>
      </div>
    </DemoCard>
  );
}

// Fragment demo
function FragmentDemo() {
  const items = signal(["Item 1", "Item 2", "Item 3"]);

  return (
    <DemoCard title="Fragment - Grouping Without Wrapper">
      <p>Items rendered with Fragment (no wrapper div):</p>

      <div class={fragmentContainerStyle}>
        <>
          <For each={items}>{(item: string) => <span class={fragmentItemStyle}>{item}</span>}</For>
        </>
      </div>

      <Button onClick={() => items.update((arr) => [...arr, `Item ${arr.length + 1}`])}>
        Add Item
      </Button>

      <p class={noteStyle}>
        A fragment groups elements without adding extra DOM nodes. It compiles to an ARRAY of its
        parts — there is no component behind it.
      </p>
    </DemoCard>
  );
}

// Styles
const buttonRowStyle = css`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
`;

const contentStyle = css`
  padding: 16px;
  background: #334155;
  border-radius: 8px;
`;

const fallbackStyle = css`
  padding: 16px;
  background: #374151;
  border-radius: 8px;
  color: #9ca3af;
  font-style: italic;
`;

const loadingStyle = css`
  padding: 16px;
  background: #1e3a5f;
  border-radius: 8px;
  color: #60a5fa;
  margin-bottom: 12px;
`;

const listStyle = css`
  list-style: none;
  margin: 12px 0;
`;

const listItemStyle = css`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #334155;
  border-radius: 6px;
  margin-bottom: 8px;
`;

const removeButtonStyle = css`
  padding: 4px 8px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: #dc2626;
  }
`;

const emptyStyle = css`
  padding: 24px;
  text-align: center;
  color: #64748b;
  background: #1e293b;
  border-radius: 8px;
  border: 2px dashed #334155;
`;

const gridStyle = css`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
  margin: 12px 0;
`;

const indexInputStyle = css`
  padding: 8px;
  background: #334155;
  border: 1px solid #475569;
  border-radius: 6px;
  color: #e2e8f0;
  text-align: center;
  font-size: 16px;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const statusBoxStyle = css`
  padding: 20px;
  background: #334155;
  border-radius: 8px;
  margin-bottom: 12px;
  text-align: center;
  font-size: 18px;
`;

const idleStyle = css`
  color: #94a3b8;
`;

const loadingTextStyle = css`
  color: #60a5fa;
`;

const successStyle = css`
  color: #4ade80;
`;

const errorStyle = css`
  color: #f87171;
`;

const overlayStyle = css`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const modalStyle = css`
  background: #1e293b;
  padding: 24px;
  border-radius: 12px;
  min-width: 300px;
  border: 1px solid #334155;

  h3 {
    margin-bottom: 12px;
  }

  p {
    margin-bottom: 16px;
    color: #94a3b8;
  }
`;

const closeButtonStyle = css`
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: #2563eb;
  }
`;

const boundaryBoxStyle = css`
  margin-top: 16px;
  border: 2px solid #334155;
  border-radius: 8px;
  overflow: hidden;
`;

const errorBoxStyle = css`
  padding: 16px;
  background: #7f1d1d;
  color: #fecaca;

  strong {
    display: block;
    margin-bottom: 8px;
  }

  p {
    margin-bottom: 12px;
    font-family: monospace;
  }
`;

const fragmentContainerStyle = css`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
`;

const fragmentItemStyle = css`
  padding: 8px 16px;
  background: #334155;
  border-radius: 6px;
`;

const noteStyle = css`
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
  margin-top: 12px;
`;
