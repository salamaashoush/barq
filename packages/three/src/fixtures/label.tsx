import type { Accessor } from "@barqjs/core";

/** Document content, compiled for the document, that a scene's `<Html>` shows. */
export function Label(props: { text: Accessor<string> }) {
  return <span class="label">{props.text()}</span>;
}
