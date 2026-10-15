import { css } from "@barqjs/css";
import { DirectionProvider, Separator } from "@barqjs/ui";

const stack = css`
  display: flex;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const heading = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1.5);
`;

const title = css`
  line-height: 1;
  font-weight: 500;
`;

const muted = css`
  color: var(--muted-foreground);
`;

export default function SeparatorRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={stack}>
        <div class={heading}>
          <div class={title}>@barqjs/ui</div>
          <div class={muted}>الأساس لنظام التصميم الخاص بك</div>
        </div>
        <Separator />
        <div>مجموعة من المكونات التي يمكنك تخصيصها وتوسيعها والبناء عليها.</div>
      </div>
    </DirectionProvider>
  );
}
