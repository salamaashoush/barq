import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { scrollFadeX } from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 20rem;
  margin-inline: auto;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl);
`;

const scroller = css`
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const list = css`
  display: flex;
  width: max-content;
  gap: calc(var(--spacing) * 1.5);
  padding: calc(var(--spacing) * 1.5);
`;

const chip = css`
  flex-shrink: 0;
  border-radius: var(--radius-lg);
  background: var(--muted);
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const tags = [
  "Design",
  "Engineering",
  "Marketing",
  "Product",
  "Research",
  "Sales",
  "Support",
  "Operations",
  "Finance",
  "Legal",
  "People",
  "Security",
];

export default function ScrollFadeHorizontal() {
  return (
    <div class={frame}>
      <div class={`${scrollFadeX} ${scroller}`}>
        <div class={list}>
          <For each={() => tags}>{(tag: string) => <div class={chip}>{tag}</div>}</For>
        </div>
      </div>
    </div>
  );
}
