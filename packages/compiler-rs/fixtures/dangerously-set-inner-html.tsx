import { signal } from "@barqjs/core"

export const html = signal("<b>bold</b>")

export default function DangerouslySetInnerHtml() {
  return (
    <div class="wrap">
      <div dangerouslySetInnerHTML={{ __html: html() }} />
      <span>after</span>
    </div>
  )
}
