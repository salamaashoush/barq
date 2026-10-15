import { css } from "@barqjs/css";
import { Separator } from "@barqjs/ui";

const list = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const row = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
`;

const value = css`
  margin: 0;
  color: var(--muted-foreground);
`;

export default function SeparatorList() {
  return (
    <div class={list}>
      <dl class={row}>
        <dt>Item 1</dt>
        <dd class={value}>Value 1</dd>
      </dl>
      <Separator />
      <dl class={row}>
        <dt>Item 2</dt>
        <dd class={value}>Value 2</dd>
      </dl>
      <Separator />
      <dl class={row}>
        <dt>Item 3</dt>
        <dd class={value}>Value 3</dd>
      </dl>
    </div>
  );
}
