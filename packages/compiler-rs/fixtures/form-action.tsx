import { action, commit, optimistic, signal } from "@barqjs/core"

export const saved = signal("")
export const draft = optimistic("")
export const log: string[] = []

/**
 * `<form action={…}>` — the server-function surface, and the whole of A5 reached
 * from compiled JSX rather than from a hand-written call.
 *
 * `action` on a `<form>` is a URL when it holds a string and a SUBMIT HANDLER
 * when it holds a function, and nothing about the expression separates them: an
 * `action()` is `(...args) => Promise<R>`, so its arity is 0 and the arity rule
 * reads it as a Cell. Before M10 the attribute channel did exactly that — it
 * CALLED the action at mount and wrote the promise it returned into the form's
 * target as `action="[object Promise]"`, with no console error. The SLOT decides
 * now, as it does for `on*`.
 *
 * The body is A5 clause (e): the guess lands in the override buffer, the answer
 * after the `yield` goes through `commit` so it reaches the authoritative one,
 * and retiring the lane drops the override onto a value that is already right.
 * Written without `commit` the answer would retire with the lane.
 */
const submit = action(function* (data: FormData) {
  const text = String(data.get("title") ?? "")
  log.push(`start:${text}`)
  draft.set(text)
  const answer = (yield Promise.resolve(text.toUpperCase())) as string
  commit(() => saved.set(answer))
  log.push(`done:${answer}`)
})

export default function FormAction() {
  return (
    <form action={submit} class="editor">
      <input name="title" value="hello" />
      <button type="submit">save</button>
      <p class="draft">{() => draft()}</p>
      <p class="saved">{() => saved()}</p>
    </form>
  )
}

export const events = [
  (root: HTMLElement) => root.querySelector<HTMLButtonElement>("button")?.click(),
]

export const optimality = {
  target: 1,
  milestone: 10,
  templates: 1,
  // One call, taking the scope — the listener it installs is owned by the
  // position (B4), which is why this is an op and not a channel.
  emits: ["formAction(", ", submit)"],
  // The two ways it used to go wrong, both silent: the attribute channel wrote
  // the promise into the form's target, and `bindProp` called the action at
  // mount to get it.
  absent: ['"action"', "bindProp"],
}
