/**
 * Components Demo
 * Tests: Show, For, Index, Switch, Match, Portal, Fragment, ErrorBoundary
 */

import { ErrorBoundary, For, Fragment, Index, Match, Portal, Show, Switch, useState } from "zest";
import { css } from "zest-extra";
import { Button, DemoCard, DemoSection } from "./shared";

export function ComponentsDemo() {
  return (
    <DemoSection>
      <ShowDemo />
      <ForDemo />
      <IndexDemo />
      <SwitchDemo />
      <PortalDemo />
      <ErrorBoundaryDemo />
      <FragmentDemo />
    </DemoSection>
  );
}

// Show component
function ShowDemo() {
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(false);

  return (
    <DemoCard title="Show - Conditional Rendering">
      <div class={buttonRowStyle}>
        <Button onClick={() => setVisible((v) => !v)}>Toggle Content</Button>
        <Button onClick={() => setLoading((l) => !l)}>Toggle Loading</Button>
      </div>

      <Show when={() => loading()} fallback={null}>
        {() => <div class={loadingStyle}>Loading...</div>}
      </Show>

      <Show
        when={() => visible() && !loading()}
        fallback={<div class={fallbackStyle}>Content is hidden</div>}
      >
        {() => (
          <div class={contentStyle}>
            This content is conditionally rendered using Show.
            <br />
            Visible: {() => (visible() ? "Yes" : "No")}
          </div>
        )}
      </Show>
    </DemoCard>
  );
}

// For component - keyed list
function ForDemo() {
  const [items, setItems] = useState([
    { id: 1, name: "Apple" },
    { id: 2, name: "Banana" },
    { id: 3, name: "Cherry" },
  ]);
  const [nextId, setNextId] = useState(4);

  const addItem = () => {
    const id = nextId();
    setItems((arr) => [...arr, { id, name: `Item ${id}` }]);
    setNextId((i) => i + 1);
  };

  const removeItem = (id: number) => {
    setItems((arr) => arr.filter((item) => item.id !== id));
  };

  const shuffleItems = () => {
    setItems((arr) => [...arr].sort(() => Math.random() - 0.5));
  };

  return (
    <DemoCard title="For - Keyed List Rendering">
      <div class={buttonRowStyle}>
        <Button onClick={addItem}>Add Item</Button>
        <Button onClick={shuffleItems}>Shuffle</Button>
      </div>

      <Show when={() => items().length === 0}>
        {() => <div class={emptyStyle}>No items. Add some!</div>}
      </Show>

      <ul class={listStyle}>
        <For each={items} keyFn={(item) => item.id}>
          {(item, index) => (
            <li class={listItemStyle}>
              <span>
                {() => index() + 1}. {item.name} (id: {item.id})
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

// Index component - position-keyed list
function IndexDemo() {
  const [values, setValues] = useState(["A", "B", "C", "D"]);

  const updateValue = (idx: number, value: string) => {
    setValues((arr) => {
      const newArr = [...arr];
      newArr[idx] = value;
      return newArr;
    });
  };

  const addValue = () => {
    setValues((arr) => [...arr, String.fromCharCode(65 + arr.length)]);
  };

  const removeValue = () => {
    setValues((arr) => arr.slice(0, -1));
  };

  return (
    <DemoCard title="Index - Position-Keyed List">
      <div class={buttonRowStyle}>
        <Button onClick={addValue}>Add</Button>
        <Button onClick={removeValue}>Remove Last</Button>
      </div>

      <div class={gridStyle}>
        <Index each={values}>
          {(value, index) => (
            <input
              class={indexInputStyle}
              type="text"
              value={value()}
              onInput={(e: Event) => updateValue(index, (e.target as HTMLInputElement).value)}
              placeholder={`Index ${index}`}
            />
          )}
        </Index>
      </div>

      <p class={noteStyle}>Index keeps nodes stable - only values update when items change.</p>
    </DemoCard>
  );
}

// Switch/Match component
function SwitchDemo() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  return (
    <DemoCard title="Switch/Match - Pattern Matching">
      <div class={buttonRowStyle}>
        <Button onClick={() => setStatus("idle")}>Idle</Button>
        <Button onClick={() => setStatus("loading")}>Loading</Button>
        <Button onClick={() => setStatus("success")}>Success</Button>
        <Button onClick={() => setStatus("error")}>Error</Button>
      </div>

      <div class={statusBoxStyle}>
        <Switch fallback={<span>Unknown status</span>}>
          <Match when={() => status() === "idle"}>
            {() => <span class={idleStyle}>Idle - Ready to start</span>}
          </Match>
          <Match when={() => status() === "loading"}>
            {() => <span class={loadingTextStyle}>Loading...</span>}
          </Match>
          <Match when={() => status() === "success"}>
            {() => <span class={successStyle}>Success! Operation completed.</span>}
          </Match>
          <Match when={() => status() === "error"}>
            {() => <span class={errorStyle}>Error! Something went wrong.</span>}
          </Match>
        </Switch>
      </div>

      <p>
        Current status: <code>{status}</code>
      </p>
    </DemoCard>
  );
}

// Portal component
function PortalDemo() {
  const [showModal, setShowModal] = useState(false);

  const closeModal = () => {
    setShowModal(false);
  };

  return (
    <DemoCard title="Portal - Render Outside DOM Tree">
      <Button onClick={() => setShowModal(true)}>Open Modal</Button>

      <Show when={() => showModal()}>
        {() => (
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
        )}
      </Show>

      <p class={noteStyle}>Portal renders children outside the current DOM hierarchy.</p>
    </DemoCard>
  );
}

// ErrorBoundary component
function ErrorBoundaryDemo() {
  const [shouldError, setShouldError] = useState(false);

  return (
    <DemoCard title="ErrorBoundary - Error Handling">
      <Button onClick={() => setShouldError((e) => !e)}>
        {() => (shouldError() ? "Fix Component" : "Break Component")}
      </Button>

      <div class={boundaryBoxStyle}>
        <ErrorBoundary
          fallback={(error, reset) => (
            <div class={errorBoxStyle}>
              <strong>Caught Error:</strong>
              <p>{error.message}</p>
              <Button
                onClick={() => {
                  setShouldError(false);
                  reset();
                }}
              >
                Reset
              </Button>
            </div>
          )}
        >
          {() => {
            // This function is called inside ErrorBoundary's effect
            // so it will re-run when shouldError changes
            if (shouldError()) {
              throw new Error("Intentional error for testing!");
            }
            return <div class={contentStyle}>Component is working fine.</div>;
          }}
        </ErrorBoundary>
      </div>
    </DemoCard>
  );
}

// Fragment demo
function FragmentDemo() {
  const [items, setItems] = useState(["Item 1", "Item 2", "Item 3"]);

  return (
    <DemoCard title="Fragment - Grouping Without Wrapper">
      <p>Items rendered with Fragment (no wrapper div):</p>

      <div class={fragmentContainerStyle}>
        <Fragment>
          <For each={items}>{(item) => <span class={fragmentItemStyle}>{item}</span>}</For>
        </Fragment>
      </div>

      <Button onClick={() => setItems((arr) => [...arr, `Item ${arr.length + 1}`])}>
        Add Item
      </Button>

      <p class={noteStyle}>Fragment groups elements without adding extra DOM nodes.</p>
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
