import { createSignal } from "@barqjs/core";
import { css, globalCss } from "@barqjs/css";

// Compiled away: `css` returns a class name and each block becomes a rule in a
// stylesheet the build emits. Nothing of these calls reaches the bundle.
globalCss`
  :root {
    color-scheme: light dark;
    --text: light-dark(#18181b, #fafafa);
    --muted: light-dark(#71717a, #a1a1aa);
    --surface: light-dark(#ffffff, #09090b);
    --border: light-dark(#e4e4e7, #27272a);
    --accent: light-dark(#18181b, #fafafa);
    --on-accent: light-dark(#fafafa, #18181b);
  }
  body {
    margin: 0;
    font-family: system-ui, sans-serif;
    line-height: 1.6;
    color: var(--text);
    background: var(--surface);
  }
`;

const page = css`
  max-width: 40rem;
  margin: 0 auto;
  padding: 4rem 1.5rem;

  h1 {
    margin: 0 0 0.25rem;
    font-size: 2rem;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0 0 1.5rem;
    color: var(--muted);
  }
`;

const button = css`
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  font: inherit;
  font-weight: 500;
  color: var(--on-accent);
  background: var(--accent);
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
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
