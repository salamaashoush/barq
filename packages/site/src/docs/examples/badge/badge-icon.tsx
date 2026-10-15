import { css } from "@barqjs/css";
import { BadgeCheck } from "@barqjs/lucide/icons/badge-check";
import { Bookmark } from "@barqjs/lucide/icons/bookmark";
import { Badge } from "@barqjs/ui";

const row = css`
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
`;

export default function BadgeWithIconLeft() {
  return (
    <div class={row}>
      <Badge variant="secondary">
        <BadgeCheck data-icon="inline-start" />
        Verified
      </Badge>
      <Badge variant="outline">
        Bookmark
        <Bookmark data-icon="inline-end" />
      </Badge>
    </div>
  );
}
