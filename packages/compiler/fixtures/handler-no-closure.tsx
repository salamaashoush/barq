export default function HandlerNoClosure() {
  return (
    <button
      type="button"
      onClick={(e: Event) => (e.currentTarget as HTMLElement).setAttribute("data-clicked", "yes")}
    >
      log
    </button>
  )
}

export const events = [(root: HTMLElement) => root.querySelector("button")?.click()]

export const optimality = {
  target: 7,
  milestone: 3,
  ordered: [["setAttribute(\"data-clicked\"", "function HandlerNoClosure"]] as Array<[string, string]>,
}
