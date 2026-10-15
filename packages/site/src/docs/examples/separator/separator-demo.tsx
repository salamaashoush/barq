import { css } from "@barqjs/css";
import { Separator } from "@barqjs/ui";

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

export default function SeparatorDemo() {
  return (
    <div class={stack}>
      <div class={heading}>
        <div class={title}>@barqjs/ui</div>
        <div class={muted}>The foundation for your design system</div>
      </div>
      <Separator />
      <div>A set of components that you can customize, extend, and build on.</div>
    </div>
  );
}
