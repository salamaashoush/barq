import { useRef } from "@barqjs/core"

export const box = useRef<HTMLDivElement>()

export default function RefBinding() {
  return (
    <div>
      <div ref={box} class="boxed">
        target
      </div>
      <span ref={(el: HTMLElement) => el.setAttribute("data-reffed", "yes")}>callback</span>
    </div>
  )
}

// Reads the object ref back out: without this the useRef path never reaches the DOM.
export const steps = [() => box.current?.setAttribute("data-ref-resolved", box.current.className)]
