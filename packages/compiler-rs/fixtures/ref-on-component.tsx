import { useRef } from "@barqjs/core"

export const viaComponent = useRef<HTMLSpanElement>()
export const viaElement = useRef<HTMLElement>()

/**
 * `ref` on a COMPONENT is an ordinary prop — the component decides what to do
 * with it — where `ref` on an intrinsic element is a runtime channel the
 * compiler owns. Treating the component case as the element case writes the
 * ref to a function instead of to a node, silently and with no error.
 */
function Boxed(props: { ref?: { current: HTMLSpanElement | null }; label: string }) {
  return (
    <span ref={props.ref} class="boxed">
      {props.label}
    </span>
  )
}

export default function RefOnComponent() {
  return (
    <div class="refs">
      <Boxed ref={viaComponent} label="component" />
      <b ref={viaElement} class="direct">
        element
      </b>
    </div>
  )
}

export const steps = [
  () => {
    viaComponent.current?.setAttribute("data-component-ref", viaComponent.current.className)
    viaElement.current?.setAttribute("data-element-ref", viaElement.current.className)
  },
]

// `props.label` is a `PropsParam` member read, so it crosses the boundary as a
// getter and stays live where the oracle's copied props object froze it.
export const goesLive = ["Boxed label"]
export const optimality = {
  target: 1,
  milestone: 5,
  templates: 2,
  // The same word, two channels, decided by what it is attached to. On the
  // intrinsic `<b>` it is the runtime ref channel and reaches `setProp`; on the
  // component it is an ordinary prop the callee decides about, and it crosses
  // as a VALUE — a getter would hand the callee a fresh object per read and the
  // ref would resolve into something nobody holds.
  emits: ["Boxed(", "ref: () => viaComponent", ", viaElement)"],
  absent: ["get ref()", "(Boxed, {"],
}
