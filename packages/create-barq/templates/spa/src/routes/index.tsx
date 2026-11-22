import { createFileRoute } from "@barqjs/router";

import { Counter } from "../components/Counter.tsx";

function Home() {
  return (
    <section>
      <h1>barq</h1>
      <p>Edit src/routes/index.tsx and save: the page updates in place.</p>
      <Counter />
    </section>
  );
}

export const Route = createFileRoute("/")({ component: Home });
