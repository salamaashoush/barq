import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { scrollFade } from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 20rem;
  margin-inline: auto;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl);
`;

const scroller = css`
  height: 18rem;
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const list = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1.5);
  padding: calc(var(--spacing) * 1.5);
`;

const row = css`
  border-radius: var(--radius-lg);
  background: var(--muted);
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const items = Array.from({ length: 12 }, (_, index) => index + 1);

export default function ScrollFadeDemo() {
  return (
    <div class={frame}>
      <div class={`${scrollFade} ${scroller}`}>
        <div class={list}>
          <For each={() => items}>{(item: number) => <div class={row}>Item {item}</div>}</For>
        </div>
      </div>
    </div>
  );
}
