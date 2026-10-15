import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { scrollFadeB, scrollFadeE, scrollFadeS, scrollFadeT } from "@barqjs/ui";

const stack = css`
  display: flex;
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

const vertical = css`
  height: 9rem;
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const horizontal = css`
  overflow-x: auto;
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

const strip = css`
  display: flex;
  width: max-content;
  gap: calc(var(--spacing) * 1.5);
  padding: calc(var(--spacing) * 1.5);
`;

const chip = css`
  flex-shrink: 0;
  border-radius: var(--radius-xl);
  background: var(--muted);
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 4);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const items = [
  "Inbox triage",
  "Design review",
  "API contract",
  "QA pass",
  "Launch notes",
  "Metrics follow-up",
];

const tags = [
  "Design",
  "Engineering",
  "Marketing",
  "Product",
  "Research",
  "Sales",
  "Support",
  "Operations",
];

export default function ScrollFadeEdge() {
  return (
    <div class={stack}>
      <div class={group}>
        <div class={frame}>
          <div class={`${scrollFadeT} ${vertical}`}>
            <ScrollFadeEdgeItems />
          </div>
        </div>
        <p class={caption}>scrollFadeT</p>
      </div>
      <div class={group}>
        <div class={frame}>
          <div class={`${scrollFadeB} ${vertical}`}>
            <ScrollFadeEdgeItems />
          </div>
        </div>
        <p class={caption}>scrollFadeB</p>
      </div>
      <div class={group}>
        <div class={frame}>
          <div class={`${scrollFadeS} ${horizontal}`}>
            <ScrollFadeEdgeTags />
          </div>
        </div>
        <p class={caption}>scrollFadeS</p>
      </div>
      <div class={group}>
        <div class={frame}>
          <div class={`${scrollFadeE} ${horizontal}`}>
            <ScrollFadeEdgeTags />
          </div>
        </div>
        <p class={caption}>scrollFadeE</p>
      </div>
    </div>
  );
}

function ScrollFadeEdgeItems() {
  return (
    <div class={list}>
      <For each={() => items}>{(item: string) => <div class={row}>{item}</div>}</For>
    </div>
  );
}

function ScrollFadeEdgeTags() {
  return (
    <div class={strip}>
      <For each={() => tags}>{(tag: string) => <div class={chip}>{tag}</div>}</For>
    </div>
  );
}
