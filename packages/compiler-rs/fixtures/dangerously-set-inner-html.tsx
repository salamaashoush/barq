import { signal } from "@barqjs/core"

export const html = signal("<b>bold</b>")

/**
 * O4 on the `html` channel. `{ __html: html() }` carries a tracked read, so the
 * compiled path binds it where `createElement` reads it once — one declared live
 * hole, and the same trade every other proven-reactive value in the corpus makes.
 * The channel threads the string it wrote last time, so a re-run that produces
 * the same html touches nothing.
 */
export default function DangerouslySetInnerHtml() {
  return (
    <div class="wrap">
      <div dangerouslySetInnerHTML={{ __html: html() }} />
      <span>after</span>
    </div>
  )
}

