/**
 * Signals & State Demo
 * Tests: useState, useMemo, useEffect, batch, untrack, createScope, onCleanup, onMount, Context
 */

import {
  useState,
  useMemo,
  useEffect,
  batch,
  untrack,
  createScope,
  useRef,
  onCleanup,
  onMount,
  createContext,
  useContext,
  Show,
} from "zest";
import { css } from "zest-extra";
import { DemoSection, DemoCard, Button, Log } from "./shared";

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

// Counter with useState
function CounterDemo() {
  const [count, setCount] = useState(0);
  const [step, setStep] = useState(1);

  return (
    <DemoCard title="useState - Counter">
      <p>Count: <strong>{count}</strong></p>
      <p>Step: <strong>{step}</strong></p>
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

// Derived values with useMemo
function MemoDemo() {
  const [firstName, setFirstName] = useState("John");
  const [lastName, setLastName] = useState("Doe");

  // Computed value
  const fullName = useMemo(() => `${firstName()} ${lastName()}`);

  // Expensive computation (simulated)
  const [items, setItems] = useState([1, 2, 3, 4, 5]);
  const sum = useMemo(() => {
    console.log("Computing sum...");
    return items().reduce((a, b) => a + b, 0);
  });
  const doubled = useMemo(() => items().map((x) => x * 2));

  return (
    <DemoCard title="useMemo - Derived State">
      <div class={inputRowStyle}>
        <input
          type="text"
          value={firstName()}
          onInput={(e: Event) => setFirstName((e.target as HTMLInputElement).value)}
          placeholder="First name"
          class={inputStyle}
        />
        <input
          type="text"
          value={lastName()}
          onInput={(e: Event) => setLastName((e.target as HTMLInputElement).value)}
          placeholder="Last name"
          class={inputStyle}
        />
      </div>
      <p>Full name: <strong>{fullName}</strong></p>

      <hr class={dividerStyle} />

      <p>Items: {() => items().join(", ")}</p>
      <p>Sum: <strong>{sum}</strong></p>
      <p>Doubled: {() => doubled().join(", ")}</p>
      <Button onClick={() => setItems((arr) => [...arr, arr.length + 1])}>
        Add Item
      </Button>
    </DemoCard>
  );
}

// Side effects with useEffect
function EffectDemo() {
  const [count, setCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((l) => [...l.slice(-4), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // Effect that runs on count change
  useEffect(() => {
    addLog(`Count changed to ${count()}`);
  });

  // Effect with cleanup
  const [intervalActive, setIntervalActive] = useState(false);

  useEffect(() => {
    if (!intervalActive()) return;

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
    <DemoCard title="useEffect - Side Effects">
      <p>Count: <strong>{count}</strong></p>
      <div class={buttonRowStyle}>
        <Button onClick={() => setCount((c) => c + 1)}>Increment</Button>
        <Button onClick={() => setIntervalActive((a) => !a)}>
          {() => (intervalActive() ? "Stop" : "Start")} Interval
        </Button>
      </div>
      <Log logs={logs} />
    </DemoCard>
  );
}

// Batched updates
function BatchDemo() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [renderCount, setRenderCount] = useState(0);

  // Track renders
  useEffect(() => {
    setRenderCount((c) => c + 1);
  });

  const unbatchedUpdate = () => {
    setA((x) => x + 1);
    setB((x) => x + 1);
  };

  const batchedUpdate = () => {
    batch(() => {
      setA((x) => x + 1);
      setB((x) => x + 1);
    });
  };

  return (
    <DemoCard title="batch - Batched Updates">
      <p>A: <strong>{a}</strong>, B: <strong>{b}</strong></p>
      <p>Effect runs: <strong>{renderCount}</strong></p>
      <div class={buttonRowStyle}>
        <Button onClick={unbatchedUpdate}>Unbatched +1</Button>
        <Button onClick={batchedUpdate}>Batched +1</Button>
        <Button onClick={() => { setA(0); setB(0); setRenderCount(0); }}>Reset</Button>
      </div>
      <p class={noteStyle}>
        Batched updates trigger effects once, unbatched may trigger multiple times.
      </p>
    </DemoCard>
  );
}

// Untracked reads
function UntrackDemo() {
  const [tracked, setTracked] = useState(0);
  const [untracked_, setUntracked] = useState(0);
  const [effectRuns, setEffectRuns] = useState(0);

  useEffect(() => {
    // This effect depends on tracked, but reads untracked without dependency
    const t = tracked();
    const u = untrack(() => untracked_());
    console.log(`Effect: tracked=${t}, untracked=${u}`);
    setEffectRuns((c) => c + 1);
  });

  return (
    <DemoCard title="untrack - Dependency Control">
      <p>Tracked: <strong>{tracked}</strong></p>
      <p>Untracked: <strong>{untracked_}</strong></p>
      <p>Effect runs: <strong>{effectRuns}</strong></p>
      <div class={buttonRowStyle}>
        <Button onClick={() => setTracked((t) => t + 1)}>
          Increment Tracked (triggers effect)
        </Button>
        <Button onClick={() => setUntracked((u) => u + 1)}>
          Increment Untracked (no effect trigger)
        </Button>
      </div>
    </DemoCard>
  );
}

// Effect scope management
function ScopeDemo() {
  const [scopeActive, setScopeActive] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  let disposeScope: (() => void) | null = null;

  // Use untrack to prevent addLog from creating signal dependencies
  const addLog = (msg: string) => {
    untrack(() => {
      setLogs((l) => [...l.slice(-4), msg]);
    });
  };

  const startScope = () => {
    if (disposeScope) return;

    disposeScope = createScope(() => {
      addLog("Scope created");

      const [counter, setCounter] = useState(0);

      useEffect(() => {
        // Read counter value, then log without tracking
        const value = counter();
        addLog(`Scoped effect: counter = ${value}`);
        return () => addLog("Scoped effect cleanup");
      });

      // Simulate some work
      const interval = setInterval(() => {
        setCounter((c) => c + 1);
      }, 1000);

      // Return cleanup
      return () => {
        clearInterval(interval);
        addLog("Scope disposed");
      };
    });

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
    <DemoCard title="createScope - Effect Isolation">
      <p>Scope active: <strong>{() => (scopeActive() ? "Yes" : "No")}</strong></p>
      <div class={buttonRowStyle}>
        <Button onClick={startScope} disabled={() => scopeActive()}>
          Create Scope
        </Button>
        <Button onClick={stopScope} disabled={() => !scopeActive()}>
          Dispose Scope
        </Button>
      </div>
      <Log logs={logs} />
      <p class={noteStyle}>
        Scopes isolate effects and clean them up together.
      </p>
    </DemoCard>
  );
}

// DOM refs
function RefDemo() {
  const inputRef = useRef<HTMLInputElement>();
  const [value, setValue] = useState("");

  const focusInput = () => {
    inputRef.current?.focus();
  };

  const selectAll = () => {
    inputRef.current?.select();
  };

  return (
    <DemoCard title="useRef - DOM References">
      <input
        ref={inputRef}
        type="text"
        value={value()}
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
  const [count, setCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((l) => [...l.slice(-4), msg]);
  };

  useEffect(() => {
    addLog(`Effect started for count=${count()}`);

    // Register cleanup - runs when effect re-runs or is disposed
    onCleanup(() => {
      addLog(`Cleanup for count=${count()}`);
    });
  });

  return (
    <DemoCard title="onCleanup - Effect Cleanup">
      <p>Count: <strong>{count}</strong></p>
      <div class={buttonRowStyle}>
        <Button onClick={() => setCount((c) => c + 1)}>Increment</Button>
        <Button onClick={() => setCount(0)}>Reset</Button>
      </div>
      <Log logs={logs} />
      <p class={noteStyle}>
        onCleanup runs before effect re-runs and when disposed.
      </p>
    </DemoCard>
  );
}

// onMount demo - runs once after component mounts
function OnMountDemo() {
  const [logs, setLogs] = useState<string[]>([]);
  const [showChild, setShowChild] = useState(false);

  const addLog = (msg: string) => {
    setLogs((l) => [...l.slice(-4), msg]);
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
        <Button onClick={() => setShowChild((s) => !s)}>
          {() => showChild() ? "Hide" : "Show"} Child
        </Button>
      </div>
      <Show when={() => showChild()}>
        {() => <ChildComponent />}
      </Show>
      <Log logs={logs} />
    </DemoCard>
  );
}

// Context demo
const ThemeContext = createContext<"light" | "dark">("light");
const UserContext = createContext<{ name: string; role: string }>();

function ContextDemo() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [user] = useState({ name: "Alice", role: "Admin" });

  return (
    <DemoCard title="Context - Dependency Injection">
      <p>Current theme setting: <strong>{theme}</strong></p>
      <div class={buttonRowStyle}>
        <Button onClick={() => setTheme((t) => t === "light" ? "dark" : "light")}>
          Toggle Theme
        </Button>
      </div>

      <ThemeContext.Provider value={() => theme()}>
        {() => (
          <UserContext.Provider value={() => user()}>
            {() => <ContextConsumer />}
          </UserContext.Provider>
        )}
      </ThemeContext.Provider>

      <p class={noteStyle}>
        Context provides dependency injection without prop drilling.
      </p>
    </DemoCard>
  );
}

function ContextConsumer() {
  // useContext returns a getter for reactive access
  const theme = useContext(ThemeContext);
  const user = useContext(UserContext);

  return (
    <div
      class={() => css`
        padding: 12px;
        border-radius: 6px;
        margin-top: 12px;
        background: ${theme() === "dark" ? "#1e293b" : "#f1f5f9"};
        color: ${theme() === "dark" ? "#e2e8f0" : "#1e293b"};
        border: 1px solid ${theme() === "dark" ? "#475569" : "#cbd5e1"};
      `}
    >
      <p>Theme from context: <strong>{theme}</strong></p>
      <p>User: <strong>{() => user().name}</strong> ({() => user().role})</p>
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
