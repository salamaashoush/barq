import { signal } from "@barqjs/core";

export function App() {
  const count = signal(0);
  // `{count}` is a tracked read, not a snapshot: the compiler wraps it, so only
  // this text node updates when the signal changes.
  return (
    <main>
      <h1>barq</h1>
      <button type="button" onClick={() => count.update((n) => n + 1)}>
        clicked {count} times
      </button>
    </main>
  );
}
