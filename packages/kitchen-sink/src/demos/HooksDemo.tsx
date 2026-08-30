/**
 * Primitives Demo
 *
 * Tests `@barqjs/primitives` directly: resource fetching, debounced/throttled
 * values, previous, persisted storage, media queries, viewport size,
 * intersection, click-outside, shortcuts, the document title and timers.
 */

import { Show, resource, signal } from "@barqjs/core";
import {
  clickOutside,
  debounced,
  interval,
  mediaQuery,
  persisted,
  previous,
  shortcut,
  throttled,
  timeout,
  visible,
  windowSize,
} from "@barqjs/primitives";
import { css } from "@barqjs/css";
import { Button, DemoCard, DemoSection, Log } from "./shared";

export function HooksDemo() {
  return (
    <DemoSection>
      <FetchDemo />
      <DebounceThrottleDemo />
      <PreviousDemo />
      <ToggleCounterDemo />
      <LocalStorageDemo />
      <MediaQueryDemo />
      <WindowSizeDemo />
      <IntersectionDemo />
      <ClickOutsideDemo />
      <KeyboardDemo />
      <TimerDemo />
    </DemoSection>
  );
}

// resource
function FetchDemo() {
  const users = resource(
    () => "/api/users",
    async (url: string): Promise<{ id: number; name: string; email: string }[]> => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      return await response.json();
    },
  );

  return (
    <DemoCard title="resource — data fetching">
      <Show when={() => users.loading()}>
        <div class={loadingStyle}>Loading...</div>
      </Show>

      <Show when={() => users.error()}>
        <div class={errorStyle}>Error: {() => users.error()?.message}</div>
      </Show>

      <Show when={() => !users.loading() && users()}>
        <ul class={listStyle}>
          {() =>
            users()?.map((user) => (
              <li class={listItemStyle}>
                {user.name} - {user.email}
              </li>
            ))
          }
        </ul>
      </Show>

      <Button onClick={() => users.refetch()}>Refetch</Button>
    </DemoCard>
  );
}

// debounced and throttled
function DebounceThrottleDemo() {
  const value = signal("");
  const settled = debounced(value, 500);
  const paced = throttled(value, 500);

  return (
    <DemoCard title="debounced & throttled">
      <input
        type="text"
        value={value()}
        onInput={(e: Event) => value.set((e.target as HTMLInputElement).value)}
        placeholder="Type something..."
        class={inputStyle}
      />

      <div class={valuesStyle}>
        <div>
          <strong>Raw:</strong>
          <span>{value}</span>
        </div>
        <div>
          <strong>Debounced (500ms):</strong>
          <span>{settled}</span>
        </div>
        <div>
          <strong>Throttled (500ms):</strong>
          <span>{paced}</span>
        </div>
      </div>
    </DemoCard>
  );
}

// previous
function PreviousDemo() {
  const count = signal(0);
  const before = previous(count);

  return (
    <DemoCard title="previous">
      <p>
        Current: <strong>{count}</strong>
      </p>
      <p>
        Previous: <strong>{() => before() ?? "N/A"}</strong>
      </p>

      <div class={buttonRowStyle}>
        <Button onClick={() => count.update((c) => c + 1)}>Increment</Button>
        <Button onClick={() => count.update((c) => c - 1)}>Decrement</Button>
        <Button onClick={() => count.set(Math.floor(Math.random() * 100))}>Random</Button>
      </div>
    </DemoCard>
  );
}

// plain signals
function ToggleCounterDemo() {
  // No primitive for these, and none is wanted: a toggle is `update((v) => !v)`
  // and a counter is a signal, so a wrapper would only hide what it costs.
  const isOn = signal(false);
  const toggle = () => isOn.update((v) => !v);
  const setIsOn = (next: boolean) => isOn.set(next);
  const count = signal(0);
  const counter = {
    count,
    increment: () => count.update((n) => n + 1),
    decrement: () => count.update((n) => n - 1),
    reset: () => count.set(0),
    set: (next: number) => count.set(next),
  };

  return (
    <DemoCard title="signals — toggle & counter">
      <div class={rowStyle}>
        <div class={boxStyle}>
          <p>
            Toggle: <strong>{() => (isOn() ? "ON" : "OFF")}</strong>
          </p>
          <div class={buttonRowStyle}>
            <Button onClick={toggle}>Toggle</Button>
            <Button onClick={() => setIsOn(true)}>Set ON</Button>
            <Button onClick={() => setIsOn(false)}>Set OFF</Button>
          </div>
        </div>

        <div class={boxStyle}>
          <p>
            Counter: <strong>{counter.count}</strong>
          </p>
          <div class={buttonRowStyle}>
            <Button onClick={counter.decrement}>-</Button>
            <Button onClick={counter.increment}>+</Button>
            <Button onClick={counter.reset}>Reset</Button>
          </div>
        </div>
      </div>
    </DemoCard>
  );
}

// persisted
function LocalStorageDemo() {
  const nameValue = persisted("demo-name", "");
  const name = nameValue;
  const setName = (next: string) => nameValue.set(next);
  const themeValue = persisted<"light" | "dark">("demo-theme", "dark");
  const theme = themeValue;
  const setTheme = (next: "light" | "dark") => themeValue.set(next);

  return (
    <DemoCard title="persisted — storage, and other tabs">
      <div class={fieldStyle}>
        <label>
          Name (persisted):
          <input
            type="text"
            value={name()}
            onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
            placeholder="Enter your name"
            class={inputStyle}
          />
        </label>
      </div>

      <div class={fieldStyle}>
        <label>
          Theme (persisted):
          <select
            value={theme()}
            onChange={(e: Event) =>
              setTheme((e.target as HTMLSelectElement).value as "light" | "dark")
            }
            class={selectStyle}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      <p class={noteStyle}>Values persist in localStorage. Refresh the page to verify.</p>
    </DemoCard>
  );
}

// mediaQuery
function MediaQueryDemo() {
  const isMobile = mediaQuery("(max-width: 768px)");
  const isDark = mediaQuery("(prefers-color-scheme: dark)");
  const isReducedMotion = mediaQuery("(prefers-reduced-motion: reduce)");

  return (
    <DemoCard title="mediaQuery — one listener per query, shared">
      <ul class={mediaListStyle}>
        <li>
          Mobile (&lt;768px): <strong>{() => (isMobile() ? "Yes" : "No")}</strong>
        </li>
        <li>
          Prefers Dark: <strong>{() => (isDark() ? "Yes" : "No")}</strong>
        </li>
        <li>
          Reduced Motion: <strong>{() => (isReducedMotion() ? "Yes" : "No")}</strong>
        </li>
      </ul>

      <p class={noteStyle}>Resize window or change system settings to see changes.</p>
    </DemoCard>
  );
}

// windowSize
function WindowSizeDemo() {
  const { width, height } = windowSize();

  return (
    <DemoCard title="windowSize — shared across every caller">
      <div class={sizeDisplayStyle}>
        <div>
          <span>Width</span>
          <strong>{width}px</strong>
        </div>
        <div>
          <span>Height</span>
          <strong>{height}px</strong>
        </div>
      </div>

      <p class={noteStyle}>Resize the window to see values update.</p>
    </DemoCard>
  );
}

// visible
function IntersectionDemo() {
  // The hooks take an ACCESSOR, so a signal is the ref: the element arrives
  // through the ref channel and every reader is live from that moment.
  const ref = signal<HTMLDivElement | null>(null);
  const isVisible = visible(ref, { threshold: 0.5 });

  return (
    <DemoCard title="visible — a shared IntersectionObserver">
      <p>
        Box is visible: <strong>{() => (isVisible() ? "Yes" : "No")}</strong>
      </p>

      <div class={scrollBoxStyle}>
        <div class={scrollContentStyle}>
          <p>Scroll down to see the box...</p>
          <div style={{ height: "200px" }} />
          <div
            ref={ref.set}
            class={targetBoxStyle}
            style={{ background: isVisible() ? "#22c55e" : "#ef4444" }}
          >
            {() => (isVisible() ? "Visible!" : "Not visible")}
          </div>
          <div style={{ height: "200px" }} />
        </div>
      </div>
    </DemoCard>
  );
}

// clickOutside
function ClickOutsideDemo() {
  const ref = signal<HTMLDivElement | null>(null);
  const isOpen = signal(false);
  const clickCount = signal(0);

  clickOutside(ref, () => {
    if (isOpen()) {
      isOpen.set(false);
      clickCount.update((c) => c + 1);
    }
  });

  return (
    <DemoCard title="clickOutside">
      <p>
        Outside clicks detected: <strong>{clickCount}</strong>
      </p>

      <div ref={ref} class={dropdownStyle} style={{ background: isOpen() ? "#3b82f6" : "#475569" }}>
        <Button onClick={() => isOpen.update((o) => !o)}>
          {() => (isOpen() ? "Close" : "Open")} Dropdown
        </Button>

        <Show when={isOpen}>
          <div class={dropdownContentStyle}>
            <p>Click outside this box to close</p>
          </div>
        </Show>
      </div>
    </DemoCard>
  );
}

// shortcut
function KeyboardDemo() {
  const logs = signal<string[]>([]);

  const addLog = (msg: string) => {
    logs.update((l) => [...l.slice(-4), msg]);
  };

  shortcut("escape", () => addLog("Escape pressed"), { whileTyping: true });
  shortcut("ctrl+s", () => addLog("Ctrl+S pressed"));
  shortcut("shift+enter", () => addLog("Shift+Enter pressed"));

  return (
    <DemoCard title="shortcut — modifiers matched exactly">
      <p>Try these shortcuts:</p>
      <ul class={shortcutListStyle}>
        <li>
          <code>Escape</code> - Log escape
        </li>
        <li>
          <code>Ctrl+S</code> - Log save
        </li>
        <li>
          <code>Shift+Enter</code> - Log shift+enter
        </li>
      </ul>

      <Log logs={logs()} />
    </DemoCard>
  );
}

// interval and timeout
function TimerDemo() {
  const count = signal(0);
  const intervalActive = signal(false);
  const message = signal("");

  interval(
    () => count.update((c) => c + 1),
    () => (intervalActive() ? 1000 : null),
  );

  const showTimeout = signal(false);
  timeout(
    () => message.set("Timeout fired!"),
    () => (showTimeout() ? 2000 : null),
  );

  return (
    <DemoCard title="interval & timeout">
      <div class={rowStyle}>
        <div class={boxStyle}>
          <p>
            Interval count: <strong>{count}</strong>
          </p>
          <Button onClick={() => intervalActive.update((a) => !a)}>
            {() => (intervalActive() ? "Stop" : "Start")} Interval
          </Button>
        </div>

        <div class={boxStyle}>
          <p>
            Message: <strong>{() => message || "(none)"}</strong>
          </p>
          <Button
            onClick={() => {
              message.set("");
              showTimeout.set(true);
            }}
          >
            Start 2s Timeout
          </Button>
        </div>
      </div>
    </DemoCard>
  );
}

// Styles
const loadingStyle = css`
  padding: 16px;
  background: #1e3a5f;
  border-radius: 8px;
  color: #60a5fa;
`;

const errorStyle = css`
  padding: 16px;
  background: #7f1d1d;
  border-radius: 8px;
  color: #fecaca;
`;

const listStyle = css`
  list-style: none;
  margin: 0 0 12px 0;
`;

const listItemStyle = css`
  padding: 8px 12px;
  background: #334155;
  border-radius: 6px;
  margin-bottom: 6px;
`;

const inputStyle = css`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #475569;
  border-radius: 6px;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 14px;
  margin-bottom: 12px;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const selectStyle = css`
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

const valuesStyle = css`
  display: flex;
  flex-direction: column;
  gap: 8px;

  div {
    display: flex;
    gap: 8px;
  }

  label {
    color: #94a3b8;
    min-width: 150px;
  }

  span {
    color: #60a5fa;
    font-family: monospace;
  }
`;

const buttonRowStyle = css`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const rowStyle = css`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
`;

const boxStyle = css`
  padding: 16px;
  background: #334155;
  border-radius: 8px;
`;

const fieldStyle = css`
  margin-bottom: 12px;

  label {
    display: block;
    margin-bottom: 4px;
    color: #94a3b8;
  }
`;

const mediaListStyle = css`
  list-style: none;

  li {
    padding: 8px 0;
    border-bottom: 1px solid #334155;
  }
`;

const sizeDisplayStyle = css`
  display: flex;
  gap: 24px;

  div {
    text-align: center;

    span {
      display: block;
      color: #94a3b8;
      font-size: 12px;
    }

    strong {
      font-size: 24px;
      color: #60a5fa;
    }
  }
`;

const scrollBoxStyle = css`
  height: 200px;
  overflow-y: auto;
  border: 1px solid #334155;
  border-radius: 8px;
  margin-top: 12px;
`;

const scrollContentStyle = css`
  padding: 16px;
`;

const targetBoxStyle = css`
  padding: 24px;
  border-radius: 8px;
  text-align: center;
  color: white;
  font-weight: bold;
  transition: background 0.3s;
`;

const dropdownStyle = css`
  padding: 16px;
  border-radius: 8px;
  transition: background 0.2s;
`;

const dropdownContentStyle = css`
  margin-top: 12px;
  padding: 16px;
  background: #1e293b;
  border-radius: 6px;
`;

const shortcutListStyle = css`
  list-style: none;
  margin: 12px 0;

  li {
    padding: 4px 0;
  }

  code {
    background: #334155;
    padding: 2px 6px;
    border-radius: 4px;
  }
`;

const noteStyle = css`
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
  margin-top: 12px;
`;
