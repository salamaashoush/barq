import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { scrollFade, scrollFadeNone } from "@barqjs/ui";

const stack = css`
  display: flex;
  width: 100%;
  min-width: 0;
  max-width: 20rem;
  margin-inline: auto;
  flex-direction: column;
  gap: calc(var(--spacing) * 6);
`;

const group = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
`;

const frame = css`
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl);
`;

const scroller = css`
  height: 12rem;
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const caption = css`
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--muted-foreground);
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

const items = Array.from({ length: 8 }, (_, index) => index + 1);

export default function ScrollFadeNone() {
  return (
    <div class={stack}>
      <div class={group}>
        <div class={frame}>
          <div class={`${scrollFade} ${scroller}`}>
            <ScrollFadeNoneItems />
          </div>
        </div>
        <p class={caption}>scrollFade</p>
      </div>
      <div class={group}>
        <div class={frame}>
          <div class={`${scrollFade} ${scrollFadeNone} ${scroller}`}>
            <ScrollFadeNoneItems />
          </div>
        </div>
        <p class={caption}>scrollFade scrollFadeNone</p>
      </div>
    </div>
  );
}

function ScrollFadeNoneItems() {
  return (
    <div class={list}>
      <For each={() => items}>{(item: number) => <div class={row}>Item {item}</div>}</For>
    </div>
  );
}
