/**
 * Signals & State Demo
 * Tests: signal, computed, effect, batch, untrack, scope, onCleanup, onMount, Context
 *
 * NOTE: This file uses clean syntax that the compiler transforms:
 * - Signal reads: `count` instead of `count()`
 * - JSX expressions: `{count + 1}` instead of `{() => count() + 1}`
 * - Control flow: `when={visible}` instead of `when={() => visible()}`
 * - Auto-computed: `const doubled = count * 2` instead of `computed(() => count() * 2)`
 */

import {
  Show,
  batch,
  context,
  scope,
  onCleanup,
  onMount,
  untrack,
  useContext,
  effect,
  signal,
} from "@barqjs/core";
import { css } from "../styles";
import { Button, DemoCard, DemoSection, Log } from "./shared";

export function SignalsDemo() {
  return (
    <DemoSection>
      <CounterDemo />
      <MemoDemo />
      <EffectDemo />
      <BatchDemo />
      <UntrackDemo />
      <ScopeDemo />
      <RefDemo />
      <OnCleanupDemo />
      <OnMountDemo />
      <ContextDemo />
    </DemoSection>
  );
}

// Counter with signal
function CounterDemo() {
  const count = signal(0);
  const step = signal(1);

  return (
    <DemoCard title="signal - Counter">
      <p>
        Count: <strong>{count}</strong>
      </p>
      <p>
        Step: <strong>{step}</strong>
      </p>
      <div class={buttonRowStyle}>
        <Button onClick={() => count.update((c) => c - step())}>-{step}</Button>
        <Button onClick={() => count.update((c) => c + step())}>+{step}</Button>
        <Button onClick={() => count.set(0)}>Reset</Button>
      </div>
      <div class={buttonRowStyle}>
        <Button onClick={() => step.set(1)}>Step 1</Button>
        <Button onClick={() => step.set(5)}>Step 5</Button>
        <Button onClick={() => step.set(10)}>Step 10</Button>
      </div>
    </DemoCard>
  );
}

// Derived values with auto-computed (compiler transforms to computed)
function MemoDemo() {
  const firstName = signal("John");
  const lastName = signal("Doe");

  // Implicit reads were rejected: an accessor in a template literal stringifies
  // to its own source text, and BARQ001 says so at the exact position.
  const fullName = () => `${firstName()} ${lastName()}`;

  // Expensive computation (simulated)
  const items = signal([1, 2, 3, 4, 5]);
  // Auto-computed values - need to call items() for method access
  const sum = () => items().reduce((a: number, b: number) => a + b, 0);
  const doubled = () => items().map((x: number) => x * 2);

  return (
    <DemoCard title="Auto-Computed - Derived State">
      <div class={inputRowStyle}>
        <input
          type="text"
          value={firstName}
          onInput={(e: Event) => firstName.set((e.target as HTMLInputElement).value)}
          placeholder="First name"
          class={inputStyle}
        />
        <input
          type="text"
          value={lastName}
          onInput={(e: Event) => lastName.set((e.target as HTMLInputElement).value)}
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
      <Button onClick={() => items.update((arr) => [...arr, arr.length + 1])}>Add Item</Button>
    </DemoCard>
  );
}

// Side effects with effect
function EffectDemo() {
  const count = signal(0);
  const logs = signal<string[]>([]);

  const addLog = (msg: string) => {
    logs.update((l) => [...l.slice(-4), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // Effect that runs on count change - still need count() in effects
  effect(() => {
    addLog(`Count changed to ${count()}`);
  });

  // Effect with cleanup
  const intervalActive = signal(false);

  effect(() => {
    if (!intervalActive()) return;

    addLog("Interval started");
    const id = setInterval(() => {
      count.update((c) => c + 1);
    }, 1000);

    return () => {
      addLog("Interval stopped");
      clearInterval(id);
    };
  });

  return (
    <DemoCard title="effect - Side Effects">
      <p>
        Count: <strong>{count}</strong>
      </p>
      <div class={buttonRowStyle}>
        <Button onClick={() => count.update((c) => c + 1)}>Increment</Button>
        <Button onClick={() => intervalActive.update((a) => !a)}>
          {intervalActive() ? "Stop" : "Start"} Interval
        </Button>
      </div>
      <Log logs={logs()} />
    </DemoCard>
  );
}

// Batched updates
function BatchDemo() {
  const a = signal(0);
  const b = signal(0);
  const renderCount = signal(0);

  // Track renders
  effect(() => {
    renderCount.update((c) => c + 1);
  });

  const unbatchedUpdate = () => {
    a.update((x) => x + 1);
    b.update((x) => x + 1);
  };

  const batchedUpdate = () => {
    batch(() => {
      a.update((x) => x + 1);
      b.update((x) => x + 1);
    });
  };

  return (
    <DemoCard title="batch - Batched Updates">
      <p>
        A: <strong>{a}</strong>, B: <strong>{b}</strong>
      </p>
      <p>
        Effect runs: <strong>{renderCount}</strong>
      </p>
      <div class={buttonRowStyle}>
        <Button onClick={unbatchedUpdate}>Unbatched +1</Button>
        <Button onClick={batchedUpdate}>Batched +1</Button>
        <Button
          onClick={() => {
            a.set(0);
            b.set(0);
            renderCount.set(0);
          }}
        >
          Reset
        </Button>
      </div>
      <p class={noteStyle}>
        Batched updates trigger effects once, unbatched may trigger multiple times.
      </p>
    </DemoCard>
  );
}

// Untracked reads
function UntrackDemo() {
  const tracked = signal(0);
  const untrackedVal = signal(0);
  const effectRuns = signal(0);

  effect(() => {
    // This effect depends on tracked, but reads untracked without dependency
    const t = tracked();
    const u = untrack(() => untrackedVal());
    console.log(`Effect: tracked=${t}, untracked=${u}`);
    effectRuns.update((c) => c + 1);
  });

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
        <Button onClick={() => tracked.update((t) => t + 1)}>
          Increment Tracked (triggers effect)
        </Button>
        <Button onClick={() => untrackedVal.update((u) => u + 1)}>
          Increment Untracked (no effect trigger)
        </Button>
      </div>
    </DemoCard>
  );
}

// Effect scope management
function ScopeDemo() {
  const scopeActive = signal(false);
  const logs = signal<string[]>([]);
  let disposeScope: (() => void) | null = null;

  // Use untrack to prevent addLog from creating signal dependencies
  const addLog = (msg: string) => {
    untrack(() => {
      logs.update((l) => [...l.slice(-4), msg]);
    });
  };

  const startScope = () => {
    if (disposeScope) return;

    disposeScope = scope(() => {
      addLog("Scope created");

      const counter = signal(0);

      effect(() => {
        // Read counter value, then log without tracking
        const value = counter();
        addLog(`Scoped effect: counter = ${value}`);
        return () => addLog("Scoped effect cleanup");
      });

      // Simulate some work
      const interval = setInterval(() => {
        counter.update((c) => c + 1);
      }, 1000);

      // Return cleanup
      return () => {
        clearInterval(interval);
        addLog("Scope disposed");
      };
    });

    scopeActive.set(true);
  };

  const stopScope = () => {
    if (disposeScope) {
      disposeScope();
      disposeScope = null;
      scopeActive.set(false);
    }
  };

  return (
    <DemoCard title="scope - Effect Isolation">
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
  const value = signal("");

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
        onInput={(e: Event) => value.set((e.target as HTMLInputElement).value)}
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
  const count = signal(0);
  const logs = signal<string[]>([]);

  const addLog = (msg: string) => {
    logs.update((l) => [...l.slice(-4), msg]);
  };

  effect(() => {
    addLog(`Effect started for count=${count()}`);

    // Register cleanup - runs when effect re-runs or is disposed
    onCleanup(() => {
      addLog(`Cleanup for count=${count()}`);
    });
  });

  return (
    <DemoCard title="onCleanup - Effect Cleanup">
      <p>
        Count: <strong>{count}</strong>
      </p>
      <div class={buttonRowStyle}>
        <Button onClick={() => count.update((c) => c + 1)}>Increment</Button>
        <Button onClick={() => count.set(0)}>Reset</Button>
      </div>
      <Log logs={logs()} />
      <p class={noteStyle}>onCleanup runs before effect re-runs and when disposed.</p>
    </DemoCard>
  );
}

// onMount demo - runs once after component mounts
function OnMountDemo() {
  const logs = signal<string[]>([]);
  const showChild = signal(false);

  const addLog = (msg: string) => {
    logs.update((l) => [...l.slice(-4), msg]);
  };

  // This runs once when component mounts
  onMount(() => {
    addLog("Parent component mounted");
  });

  function ChildComponent() {
    onMount(() => {
      addLog("Child component mounted");
    });

    return <p>Child is mounted!</p>;
  }

  return (
    <DemoCard title="onMount - After First Render">
      <p>onMount runs once after the component renders.</p>
      <div class={buttonRowStyle}>
        <Button onClick={() => showChild.update((s) => !s)}>
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
const ThemeContext = context<"light" | "dark">("light");
const UserContext = context<{ name: string; role: string }>();

function ContextDemo() {
  const theme = signal<"light" | "dark">("dark");
  const user = signal({ name: "Alice", role: "Admin" });

  return (
    <DemoCard title="Context - Dependency Injection">
      <p>
        Current theme setting: <strong>{theme}</strong>
      </p>
      <div class={buttonRowStyle}>
        <Button onClick={() => theme.update((t) => (t === "light" ? "dark" : "light"))}>
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

function ContextConsumer() {
  // getContext returns a getter for reactive access
  const theme = useContext(ThemeContext);
  const user = useContext(UserContext);

  return (
    <div
      class={css`
        padding: 12px;
        border-radius: 6px;
        margin-top: 12px;
        background: ${theme() === "dark" ? "#1e293b" : "#f1f5f9"};
        color: ${theme() === "dark" ? "#e2e8f0" : "#1e293b"};
        border: 1px solid ${theme() === "dark" ? "#475569" : "#cbd5e1"};
      `}
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
