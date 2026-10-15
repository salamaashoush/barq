import { css } from "@barqjs/css";
import { DirectionProvider, Item, ItemContent, ItemMedia, ItemTitle, Spinner } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 20rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

const clamped = css`
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
`;

const amount = css`
  flex: none;
  justify-content: flex-end;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-variant-numeric: tabular-nums;
`;

export default function SpinnerRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <Item variant="muted">
          <ItemMedia>
            <Spinner />
          </ItemMedia>
          <ItemContent>
            <ItemTitle class={clamped}>جاري معالجة الدفع...</ItemTitle>
          </ItemContent>
          <ItemContent class={amount}>
            <span>١٠٠.٠٠ دولار</span>
          </ItemContent>
        </Item>
      </div>
    </DirectionProvider>
  );
}
