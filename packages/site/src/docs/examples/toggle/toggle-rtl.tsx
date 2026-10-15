import { css } from "@barqjs/css";
import { Bookmark } from "@barqjs/lucide/icons/bookmark";
import { DirectionProvider, Toggle } from "@barqjs/ui";

const bookmark = css`
  [aria-pressed="true"] & {
    fill: var(--foreground);
  }
`;

const label = "إشارة مرجعية";

export default function ToggleRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <Toggle aria-label="Toggle bookmark" size="sm" variant="outline">
          <Bookmark class={bookmark} />
          {label}
        </Toggle>
      </div>
    </DirectionProvider>
  );
}
