import { css } from "@barqjs/css";
import { ArrowUpRight } from "@barqjs/lucide/icons/arrow-up-right";
import { FolderCode } from "@barqjs/lucide/icons/folder-code";
import {
  Button,
  DirectionProvider,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
`;

const actions = css`
  flex-direction: row;
  justify-content: center;
  gap: calc(var(--spacing) * 2);
`;

const muted = css`
  color: var(--muted-foreground);
`;

const arrow = css`
  [dir="rtl"] & {
    transform: rotate(270deg);
  }
`;

export default function EmptyRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderCode />
            </EmptyMedia>
            <EmptyTitle>لا توجد مشاريع بعد</EmptyTitle>
            <EmptyDescription>
              لم تقم بإنشاء أي مشاريع بعد. ابدأ بإنشاء مشروعك الأول.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent class={actions}>
            <Button>إنشاء مشروع</Button>
            <Button variant="outline">استيراد مشروع</Button>
          </EmptyContent>
          <Button variant="link" href="#" class={muted} size="sm">
            تعرف على المزيد
            <ArrowUpRight class={arrow} data-icon="inline-end" />
          </Button>
        </Empty>
      </div>
    </DirectionProvider>
  );
}
