import { createSignal } from "@barqjs/core";
import { css, globalCss } from "@barqjs/css";

// Compiled away: `css` returns a class name and each block becomes a rule in a
// stylesheet the build emits. Nothing of these calls reaches the bundle.
// The colours are read from the names the barq-ui theme defines, each with a
// light fallback. Before `barq-ui init` the fallbacks draw the page; after it
// the page and the components share one theme, dark mode included.
globalCss`
  body {
    margin: 0;
    font-family: system-ui, sans-serif;
    line-height: 1.6;
    color: var(--foreground, #18181b);
    background: var(--background, #ffffff);
  }
`;

const page = css`
  max-width: 40rem;
  margin: 0 auto;
  padding: 4rem 1.5rem;

  h1 {
    margin: 0 0 0.25rem;
    font-size: 2rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0 0 1.5rem;
    color: var(--muted-foreground, #71717a);
  }
`;

const button = css`
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--border, #e4e4e7);
  border-radius: 0.5rem;
  font: inherit;
  font-weight: 500;
  color: var(--primary-foreground, #fafafa);
  background: var(--primary, #18181b);
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }

  &:focus-visible {
    outline: 2px solid var(--ring, #18181b);
    outline-offset: 2px;
  }
`;

export function App() {
  const [count, setCount] = createSignal(0);
  // `{count()}` is a tracked read, not a snapshot: only this text node updates
  // when the signal changes, and `App` does not run again.
  return (
    <main class={page}>
      <h1>barq</h1>
      <p>Edit src/App.tsx and save: the page updates in place.</p>
      <button type="button" class={button} onClick={() => setCount((n) => n + 1)}>
        clicked {count()} times
      </button>
    </main>
  );
}
