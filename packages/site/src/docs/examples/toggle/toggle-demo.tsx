import { css } from "@barqjs/css";
import { Bookmark } from "@barqjs/lucide/icons/bookmark";
import { Toggle } from "@barqjs/ui";

const bookmark = css`
  [data-state="on"] & {
    fill: var(--foreground);
  }
`;

export default function ToggleDemo() {
  return (
    <Toggle aria-label="Toggle bookmark" size="sm" variant="outline">
      <Bookmark class={bookmark} />
      Bookmark
    </Toggle>
  );
}
