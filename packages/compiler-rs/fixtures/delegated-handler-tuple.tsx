import { signal } from "@barqjs/core"

export const picked = signal("none")

/** The [handler, data] form: one shared function, no per-row closure. */
const pick = (label: unknown) => picked.set(String(label))

export default function DelegatedHandlerTuple() {
  return (
    <ul>
      <li data-row="a" onClick={[pick, "a"]}>
        a
      </li>
      <li data-row="b" onClick={[pick, "b"]}>
        b
      </li>
      <li data-row="picked">{() => picked()}</li>
    </ul>
  )
}

export const events = [
  (root: HTMLElement) => root.querySelector<HTMLElement>('[data-row="b"]')?.click(),
  (root: HTMLElement) => root.querySelector<HTMLElement>('[data-row="a"]')?.click(),
]
