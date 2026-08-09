import { signal } from "@barqjs/core"

export const active = signal(false)

/**
 * Attribute values that are not strings: a number literal, a boolean-shaped
 * expression, and a live ternary. The number has to reach the template as the
 * string the DOM would have stringified it to, and the shorthand `hidden` is a
 * literal-true in an attribute channel.
 */
export default function NumericAndBooleanAttrs() {
  return (
    <div class="attrs">
      <input id="x" tabIndex={2} maxLength={10} />
      <span data-live={() => (active() ? "on" : "off")} hidden={false}>
        s
      </span>
    </div>
  )
}

export const steps = [() => active.set(true), () => active.set(false)]
export const optimality = {
  target: 3,
  milestone: 5,
  templates: 1,
  patchCalls: 1,
  // A NUMBER folds into the attribute channel as the string the DOM would have
  // stringified it to, and the name is not rewritten on the way — `tabIndex` is
  // what the oracle's `setAttribute` receives, and HTML attribute names are
  // case-insensitive, so folding it is only correct if the bytes match.
  emits: ['<input id="x" tabIndex="2" maxLength="10">'],
  absent: ['hidden="', "tabIndex={"],
}
