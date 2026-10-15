import { createSignal } from "@barqjs/core";
import { createFileRoute } from "@barqjs/router";

function Home() {
  const [count, setCount] = createSignal(0);
  return (
    <section>
      <h1>barq</h1>
      <button type="button" onClick={() => setCount((n) => n + 1)}>
        clicked {count} times
      </button>
    </section>
  );
}

export const Route = createFileRoute("/")({ component: Home });
