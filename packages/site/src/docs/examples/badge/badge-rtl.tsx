import { css } from "@barqjs/css";
import { BadgeCheck } from "@barqjs/lucide/icons/badge-check";
import { Bookmark } from "@barqjs/lucide/icons/bookmark";
import { Badge, DirectionProvider } from "@barqjs/ui";

const row = css`
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  justify-content: center;
  gap: calc(var(--spacing) * 2);
`;

export default function BadgeRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={row}>
        <Badge>شارة</Badge>
        <Badge variant="secondary">ثانوي</Badge>
        <Badge variant="destructive">مدمر</Badge>
        <Badge variant="outline">مخطط</Badge>
        <Badge variant="secondary">
          <BadgeCheck data-icon="inline-start" />
          متحقق
        </Badge>
        <Badge variant="outline">
          إشارة مرجعية
          <Bookmark data-icon="inline-end" />
        </Badge>
      </div>
    </DirectionProvider>
  );
}
