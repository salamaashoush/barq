/**
 * The smallest interactive app: one signal, one handler, one live text.
 * Shared by all three bundle-size rows; only the import specifiers move.
 */
import { createSignal } from "solid-js"
import { render } from "@solidjs/web"

function App() {
  const [count, setCount] = createSignal(0)
  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      Hello, clicked {count()} times
    </button>
  )
}

render(() => <App />, document.getElementById("main"))
