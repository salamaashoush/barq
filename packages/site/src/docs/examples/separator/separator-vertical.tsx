import { css } from "@barqjs/css";
import { Separator } from "@barqjs/ui";

const row = css`
  display: flex;
  height: calc(var(--spacing) * 5);
  align-items: center;
  gap: calc(var(--spacing) * 4);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

export default function SeparatorVertical() {
  return (
    <div class={row}>
      <div>Blog</div>
      <Separator orientation="vertical" />
      <div>Docs</div>
      <Separator orientation="vertical" />
      <div>Source</div>
    </div>
  );
}
