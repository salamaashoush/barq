import { NoHydration, signal } from "@barqjs/core"

export const clicks = signal(0)

/**
 * `<NoHydration>` — an ISLAND. The server renders the subtree and the client
 * never claims it, so a static region costs zero hydration work and ships no
 * behaviour.
 *
 * Solid's `NoHydration`, and deliberately
 * not one of the ten control-flow constructs: it renders its children once and
 * unconditionally, and what it decides is who CLAIMS the markup.
 *
 * This is the fine-grained answer to the goal React reaches for with selective
 * hydration. React splits hydration into interruptible units because it
 * re-executes every component to hydrate; a framework whose components run once
 * has no such cost to split, and the win available to it is not hydrating at all.
 */
export default function NoHydrationIsland() {
  return (
    <div>
      <NoHydration>
        <p class="static">never hydrated</p>
      </NoHydration>
      <button class="live" onClick={() => clicks.set(clicks() + 1)}>
        {() => String(clicks())}
      </button>
    </div>
  )
}

export const events = [(root: HTMLElement) => root.querySelector<HTMLElement>(".live")?.click()]

export const optimality = {
  target: 7,
  milestone: 14,
  templates: 2,
  // The island is a REGION like any other — one `island` call taking the
  // insertion pair the walk computed — and the subtree inside it is an ordinary
  // template. What must NOT appear is a component call: the construct is
  // lowered, not invoked.
  emits: ["island(", "template("],
  absent: ["NoHydration("],
}
