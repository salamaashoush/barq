import { describe, expect, test } from "bun:test";
import { type JSXElement, useState } from "@barqjs/core";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "./index.ts";

// Simple counter component for testing
function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = useState(initial);
  return (
    <div>
      <span data-testid="count">Count: {count}</span>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <button type="button" onClick={() => setCount((c) => c - 1)}>
        Decrement
      </button>
    </div>
  );
}

// Wrapper component for testing
function ThemeWrapper({ children }: { children: JSXElement }) {
  return <div data-testid="theme-wrapper">{children}</div>;
}

// Component with async behavior
function AsyncComponent() {
  const [data, setData] = useState<string | null>(null);

  const loadData = () => {
    setTimeout(() => setData("loaded"), 50);
  };

  return (
    <div>
      <span data-testid="status">{() => data() ?? "idle"}</span>
      <button type="button" onClick={loadData}>
        Load
      </button>
    </div>
  );
}

describe("render", () => {
  test("renders a component", () => {
    const { container } = render(() => <div>Hello World</div>);
    expect(container.textContent).toBe("Hello World");
  });

  test("returns query helpers", () => {
    render(() => <div>Hello World</div>);
    expect(screen.getByText("Hello World")).toBeTruthy();
  });

  test("renders with data-testid", () => {
    render(() => <div data-testid="test">Test</div>);
    expect(screen.getByTestId("test")).toBeTruthy();
  });

  test("asFragment returns innerHTML", () => {
    const { asFragment } = render(() => <div>Content</div>);
    expect(asFragment()).toBe("<div>Content</div>");
  });

  test("unmount removes the component", () => {
    const { unmount, container } = render(() => <div>Content</div>);
    expect(container.textContent).toBe("Content");
    unmount();
    expect(container.textContent).toBe("");
  });

  test("renders into custom container", () => {
    const customContainer = document.createElement("section");
    document.body.appendChild(customContainer);

    render(() => <div>Custom</div>, { container: customContainer });
    expect(customContainer.textContent).toBe("Custom");

    document.body.removeChild(customContainer);
  });

  test("works with wrapper", () => {
    render(() => <span>Content</span>, { wrapper: ThemeWrapper });

    expect(screen.getByTestId("theme-wrapper")).toBeTruthy();
    expect(screen.getByText("Content")).toBeTruthy();
  });
});

describe("reactive updates", () => {
  test("updates are synchronous", () => {
    render(() => <Counter />);

    expect(screen.getByTestId("count").textContent).toBe("Count: 0");

    const incrementBtn = screen.getByText("Increment");
    const decrementBtn = screen.getByText("Decrement");

    if (!(incrementBtn instanceof HTMLElement) || !(decrementBtn instanceof HTMLElement)) {
      throw new Error("Expected buttons to be HTMLElements");
    }

    fireEvent.click(incrementBtn);
    expect(screen.getByTestId("count").textContent).toBe("Count: 1");

    fireEvent.click(incrementBtn);
    expect(screen.getByTestId("count").textContent).toBe("Count: 2");

    fireEvent.click(decrementBtn);
    expect(screen.getByTestId("count").textContent).toBe("Count: 1");
  });

  test("renders with initial props", () => {
    render(() => <Counter initial={10} />);
    expect(screen.getByTestId("count").textContent).toBe("Count: 10");
  });
});

describe("renderHook", () => {
  test("renders a hook", () => {
    const { result } = renderHook(() => {
      const [count, setCount] = useState(0);
      return { count, setCount };
    });

    expect(result.current.count()).toBe(0);
  });

  test("hook updates work", () => {
    const { result } = renderHook(() => {
      const [count, setCount] = useState(0);
      return {
        count,
        increment: () => setCount((c) => c + 1),
      };
    });

    expect(result.current.count()).toBe(0);
    result.current.increment();
    expect(result.current.count()).toBe(1);
  });

  test("renderHook with initial props", () => {
    const { result } = renderHook(
      (props: { initial: number }) => {
        const [count] = useState(props.initial);
        return count;
      },
      { initialProps: { initial: 5 } },
    );

    expect(result.current()).toBe(5);
  });
});

describe("waitFor", () => {
  test("waits for async updates", async () => {
    render(() => <AsyncComponent />);

    expect(screen.getByTestId("status").textContent).toBe("idle");

    const loadBtn = screen.getByText("Load");
    if (!(loadBtn instanceof HTMLElement)) {
      throw new Error("Expected load button to be HTMLElement");
    }
    fireEvent.click(loadBtn);

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("loaded");
    });
  });

  test("times out if condition not met", async () => {
    render(() => <div>Static</div>);

    let threw = false;
    try {
      await waitFor(
        () => {
          if (!screen.queryByText("Never")) {
            throw new Error("Not found");
          }
        },
        { timeout: 100 },
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("cleanup", () => {
  test("cleanup removes all rendered components", () => {
    render(() => <div data-testid="a">A</div>);
    render(() => <div data-testid="b">B</div>);

    expect(screen.getByTestId("a")).toBeTruthy();
    expect(screen.getByTestId("b")).toBeTruthy();

    cleanup();

    expect(screen.queryByTestId("a")).toBeNull();
    expect(screen.queryByTestId("b")).toBeNull();
  });
});

describe("debug", () => {
  test("debug logs to console", () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(" "));

    const { debug } = render(() => <div>Debug me</div>);
    debug();

    console.log = originalLog;

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]).toContain("Debug me");
  });
});
