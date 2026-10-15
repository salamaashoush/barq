/**
 * Signals & State Demo
 * Tests: createSignal, derived values, createEffect, flush, untrack, createRoot, onCleanup,
 * onSettled, Context
 *
 * NOTE: This file uses clean syntax that the compiler transforms:
 * - Signal reads: `count` instead of `count()`
 * - JSX expressions: `{count + 1}` instead of `{() => count() + 1}`
 * - Control flow: `when={visible}` instead of `when={() => visible()}`
 * - Auto-computed: `const doubled = count * 2` instead of `createMemo(() => count() * 2)`
 */

import {
  Show,
  createContext,
  createEffect,
  createRoot,
  createSignal,
  flush,
  onCleanup,
  onSettled,
  untrack,
  useContext,
} from "@barqjs/core";
import { css } from "@barqjs/css";
import { Button, DemoCard, DemoSection, Log } from "./shared";

export function SignalsDemo() {
  return (
    <DemoSection>
      <CounterDemo />
      <MemoDemo />
      <EffectDemo />
      <FlushDemo />
      <UntrackDemo />
      <RootDemo />
      <RefDemo />
      <OnCleanupDemo />
      <OnSettledDemo />
      <ContextDemo />
    </DemoSection>
  );
}

// Counter with createSignal
function CounterDemo() {
  const [count, setCount] = createSignal(0);
  const [step, setStep] = createSignal(1);

  return (
    <DemoCard title="createSignal - Counter">
      <p>
        Count: <strong>{count}</strong>
      </p>
      <p>
        Step: <strong>{step}</strong>
      </p>
      <div class={buttonRowStyle}>
        <Button onClick={() => setCount((c) => c - step())}>-{step}</Button>
        <Button onClick={() => setCount((c) => c + step())}>+{step}</Button>
        <Button onClick={() => setCount(0)}>Reset</Button>
      </div>
      <div class={buttonRowStyle}>
        <Button onClick={() => setStep(1)}>Step 1</Button>
        <Button onClick={() => setStep(5)}>Step 5</Button>
        <Button onClick={() => setStep(10)}>Step 10</Button>
      </div>
    </DemoCard>
  );
}

// Derived values, written as plain functions over the signals they read
function MemoDemo() {
  const [firstName, setFirstName] = createSignal("John");
  const [lastName, setLastName] = createSignal("Doe");

  // Implicit reads were rejected: an accessor in a template literal stringifies
  // to its own source text, and BARQ001 says so at the exact position.
  const fullName = () => `${firstName()} ${lastName()}`;

  // Expensive computation (simulated)
  const [items, setItems] = createSignal([1, 2, 3, 4, 5]);
  // Auto-computed values - need to call items() for method access
  const sum = () => items().reduce((a: number, b: number) => a + b, 0);
  const doubled = () => items().map((x: number) => x * 2);

  return (
    <DemoCard title="Auto-Computed - Derived State">
      <div class={inputRowStyle}>
        <input
          type="text"
          value={firstName}
          onInput={(e: Event) => setFirstName((e.target as HTMLInputElement).value)}
          placeholder="First name"
          class={inputStyle}
        />
        <input
          type="text"
          value={lastName}
          onInput={(e: Event) => setLastName((e.target as HTMLInputElement).value)}
          placeholder="Last name"
          class={inputStyle}
        />
      </div>
      <p>
        Full name: <strong>{fullName}</strong>
      </p>

      <hr class={dividerStyle} />

      <p>Items: {items().join(", ")}</p>
      <p>
        Sum: <strong>{sum}</strong>
      </p>
      <p>Doubled: {doubled().join(", ")}</p>
      <Button onClick={() => setItems((arr) => [...arr, arr.length + 1])}>Add Item</Button>
    </DemoCard>
  );
}

// Side effects with createEffect
function EffectDemo() {
  const [count, setCount] = createSignal(0);
  const [logs, setLogs] = createSignal<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((l) => [...l.slice(-4), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // The first function reads count; the second runs with what it returned
  createEffect(count, (value) => {
    addLog(`Count changed to ${value}`);
  });

  // Effect with cleanup
  const [intervalActive, setIntervalActive] = createSignal(false);

  createEffect(intervalActive, (active) => {
    if (!active) return;

    addLog("Interval started");
    const id = setInterval(() => {
      setCount((c) => c + 1);
    }, 1000);

    return () => {
      addLog("Interval stopped");
      clearInterval(id);
    };
  });

  return (
    <DemoCard title="createEffect - Side Effects">
      <p>
        Count: <strong>{count}</strong>
      </p>
      <div class={buttonRowStyle}>
        <Button onClick={() => setCount((c) => c + 1)}>Increment</Button>
        <Button onClick={() => setIntervalActive((a) => !a)}>
          {intervalActive() ? "Stop" : "Start"} Interval
        </Button>
      </div>
      <Log logs={logs()} />
    </DemoCard>
  );
}

// Staged writes and flush
function FlushDemo() {
  const [a, setA] = createSignal(0);
  const [b, setB] = createSignal(0);
  const [effectRuns, setEffectRuns] = createSignal(0);

  // Count the effect's runs
  createEffect(
    () => [a(), b()],
    () => {
      setEffectRuns((c) => c + 1);
    },
  );

  const stagedUpdate = () => {
    setA((x) => x + 1);
    setB((x) => x + 1);
  };

  const flushedUpdate = () => {
    setA((x) => x + 1);
    flush();
    setB((x) => x + 1);
    flush();
  };

  return (
    <DemoCard title="flush - Batched Updates">
      <p>
        A: <strong>{a}</strong>, B: <strong>{b}</strong>
      </p>
      <p>
        Effect runs: <strong>{effectRuns}</strong>
      </p>
      <div class={buttonRowStyle}>
        <Button onClick={stagedUpdate}>Both writes, one flush +1</Button>
        <Button onClick={flushedUpdate}>flush() between writes +1</Button>
        <Button
          onClick={() => {
            setA(0);
            setB(0);
            setEffectRuns(0);
          }}
        >
          Reset
        </Button>
      </div>
      <p class={noteStyle}>
        Writes are staged and applied together, so two writes run the effect once. A flush() between
        them applies each on its own and the effect runs twice.
      </p>
    </DemoCard>
  );
}

// Untracked reads
function UntrackDemo() {
  const [tracked, setTracked] = createSignal(0);
  const [untrackedVal, setUntrackedVal] = createSignal(0);
  const [effectRuns, setEffectRuns] = createSignal(0);

  createEffect(
    () => {
      // This effect depends on tracked, but reads untracked without dependency
      const t = tracked();
      const u = untrack(() => untrackedVal());
      return [t, u] as const;
    },
    ([t, u]) => {
      console.log(`Effect: tracked=${t}, untracked=${u}`);
      setEffectRuns((c) => c + 1);
    },
  );

  return (
    <DemoCard title="untrack - Dependency Control">
      <p>
        Tracked: <strong>{tracked}</strong>
      </p>
      <p>
        Untracked: <strong>{untrackedVal}</strong>
      </p>
      <p>
        Effect runs: <strong>{effectRuns}</strong>
      </p>
      <div class={buttonRowStyle}>
        <Button onClick={() => setTracked((t) => t + 1)}>
          Increment Tracked (triggers effect)
        </Button>
        <Button onClick={() => setUntrackedVal((u) => u + 1)}>
          Increment Untracked (no effect trigger)
        </Button>
      </div>
    </DemoCard>
  );
}

// Effect scope management
function RootDemo() {
  const [scopeActive, setScopeActive] = createSignal(false);
  const [logs, setLogs] = createSignal<string[]>([]);
  let disposeScope: (() => void) | null = null;

  // Use untrack to prevent addLog from creating signal dependencies
  const addLog = (msg: string) => {
    untrack(() => {
      setLogs((l) => [...l.slice(-4), msg]);
    });
  };

  const startScope = () => {
    if (disposeScope) return;

    disposeScope = createRoot((dispose) => {
      const [counter, setCounter] = createSignal(0);

      createEffect(counter, (value) => {
        addLog(`Scoped effect: counter = ${value}`);
        return () => addLog("Scoped effect cleanup");
      });

      // Simulate some work
      const interval = setInterval(() => {
        setCounter((c) => c + 1);
      }, 1000);

      onCleanup(() => {
        clearInterval(interval);
        addLog("Scope disposed");
      });

      return dispose;
    });

    addLog("Scope created");
    setScopeActive(true);
  };

  const stopScope = () => {
    if (disposeScope) {
      disposeScope();
      disposeScope = null;
      setScopeActive(false);
    }
  };

  return (
    <DemoCard title="createRoot - Effect Isolation">
      <p>
        Scope active: <strong>{scopeActive() ? "Yes" : "No"}</strong>
      </p>
      <div class={buttonRowStyle}>
        <Button onClick={startScope} disabled={scopeActive()}>
          Create Scope
        </Button>
        <Button onClick={stopScope} disabled={!scopeActive()}>
          Dispose Scope
        </Button>
      </div>
      <Log logs={logs()} />
      <p class={noteStyle}>Scopes isolate effects and clean them up together.</p>
    </DemoCard>
  );
}

// DOM refs
function RefDemo() {
  // B3: a writable binding IS the ref. `ref={inputRef}` compiles to an
  // assignment, so there is no `{current}` box and nothing to unwrap.
  let inputRef: HTMLInputElement | undefined;
  const [value, setValue] = createSignal("");

  const focusInput = () => {
    inputRef?.focus();
  };

  const selectAll = () => {
    inputRef?.select();
  };

  return (
    <DemoCard title="ref - DOM References">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onInput={(e: Event) => setValue((e.target as HTMLInputElement).value)}
        placeholder="Type something..."
        class={inputStyle}
      />
      <p>Value: {value}</p>
      <div class={buttonRowStyle}>
        <Button onClick={focusInput}>Focus Input</Button>
        <Button onClick={selectAll}>Select All</Button>
      </div>
    </DemoCard>
  );
}

// onCleanup demo - cleanup when effect re-runs
function OnCleanupDemo() {
  const [count, setCount] = createSignal(0);
  const [logs, setLogs] = createSignal<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((l) => [...l.slice(-4), msg]);
  };

  createEffect(
    () => {
      const value = count();

      // Register cleanup - runs when effect re-runs or is disposed
      onCleanup(() => {
        addLog(`Cleanup for count=${value}`);
      });

      return value;
    },
    (value) => {
      addLog(`Effect started for count=${value}`);
    },
  );

  return (
    <DemoCard title="onCleanup - Effect Cleanup">
      <p>
        Count: <strong>{count}</strong>
      </p>
      <div class={buttonRowStyle}>
        <Button onClick={() => setCount((c) => c + 1)}>Increment</Button>
        <Button onClick={() => setCount(0)}>Reset</Button>
      </div>
      <Log logs={logs()} />
      <p class={noteStyle}>onCleanup runs before effect re-runs and when disposed.</p>
    </DemoCard>
  );
}

// onSettled demo - runs once after component mounts
function OnSettledDemo() {
  const [logs, setLogs] = createSignal<string[]>([]);
  const [showChild, setShowChild] = createSignal(false);

  const addLog = (msg: string) => {
    setLogs((l) => [...l.slice(-4), msg]);
  };

  // This runs once when component mounts
  onSettled(() => {
    addLog("Parent component mounted");
  });

  function ChildComponent() {
    onSettled(() => {
      addLog("Child component mounted");
    });

    return <p>Child is mounted!</p>;
  }

  return (
    <DemoCard title="onSettled - After First Render">
      <p>onSettled runs once after the component renders.</p>
      <div class={buttonRowStyle}>
        <Button onClick={() => setShowChild((s) => !s)}>
          {showChild() ? "Hide" : "Show"} Child
        </Button>
      </div>
      <Show when={showChild}>
        <ChildComponent />
      </Show>
      <Log logs={logs()} />
    </DemoCard>
  );
}

// Context demo
const ThemeContext = createContext<"light" | "dark">("light");
const UserContext = createContext<{ name: string; role: string }>();

function ContextDemo() {
  const [theme, setTheme] = createSignal<"light" | "dark">("dark");
  const [user] = createSignal({ name: "Alice", role: "Admin" });

  return (
    <DemoCard title="Context - Dependency Injection">
      <p>
        Current theme setting: <strong>{theme}</strong>
      </p>
      <div class={buttonRowStyle}>
        <Button onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}>
          Toggle Theme
        </Button>
      </div>

      <ThemeContext.Provider value={theme}>
        <UserContext.Provider value={user}>
          <ContextConsumer />
        </UserContext.Provider>
      </ThemeContext.Provider>

      <p class={noteStyle}>Context provides dependency injection without prop drilling.</p>
    </DemoCard>
  );
}

const consumerStyle = css`
  padding: 12px;
  border-radius: 6px;
  margin-top: 12px;
  background: var(--consumer-bg);
  color: var(--consumer-fg);
  border: 1px solid var(--consumer-border);
`;

function ContextConsumer() {
  // useContext returns a getter for reactive access
  const theme = useContext(ThemeContext);
  const user = useContext(UserContext);

  // The three values are the only thing about this block that is not known at
  // compile time, so they are the only thing left at runtime: the block itself
  // compiles to a class, and `style` sets three custom properties on this one
  // element. Interpolating them into the CSS instead reports BARQ015 and keeps
  // the whole block on the runtime.
  return (
    <div
      class={consumerStyle}
      style={{
        "--consumer-bg": theme() === "dark" ? "#1e293b" : "#f1f5f9",
        "--consumer-fg": theme() === "dark" ? "#e2e8f0" : "#1e293b",
        "--consumer-border": theme() === "dark" ? "#475569" : "#cbd5e1",
      }}
    >
      <p>
        Theme from context: <strong>{theme}</strong>
      </p>
      <p>
        User: <strong>{user()?.name}</strong> ({user()?.role})
      </p>
    </div>
  );
}

// Shared styles
const buttonRowStyle = css`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
`;

const inputRowStyle = css`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
`;

const inputStyle = css`
  padding: 8px 12px;
  border: 1px solid #475569;
  border-radius: 6px;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const dividerStyle = css`
  border: none;
  border-top: 1px solid #334155;
  margin: 16px 0;
`;

const noteStyle = css`
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
  margin-top: 8px;
`;
