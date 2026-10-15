import { css } from "@barqjs/css";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Button, DirectionProvider, Spinner } from "@barqjs/ui";

const row = css`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--spacing) * 2);
`;

const arrow = css`
  [dir="rtl"] & {
    transform: rotate(180deg);
  }
`;

export default function ButtonRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={row}>
        <Button variant="outline">زر</Button>
        <Button variant="destructive">حذف</Button>
        <Button variant="outline">
          إرسال
          <ArrowRight class={arrow} data-icon="inline-end" />
        </Button>
        <Button variant="outline" size="icon" aria-label="Add">
          <Plus />
        </Button>
        <Button variant="secondary" disabled>
          <Spinner />
          جاري التحميل
        </Button>
      </div>
    </DirectionProvider>
  );
}
