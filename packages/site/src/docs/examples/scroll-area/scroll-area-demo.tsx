import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ScrollArea, Separator } from "@barqjs/ui";

const area = css`
  height: 18rem;
  width: 12rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
`;

const body = css`
  padding: calc(var(--spacing) * 4);
`;

const heading = css`
  margin-block-end: calc(var(--spacing) * 4);
  font-size: 0.875rem;
  line-height: 1;
  font-weight: 500;
`;

const row = css`
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const rule = css`
  margin-block: calc(var(--spacing) * 2);
`;

const tags = Array.from({ length: 50 }, (_, index) => `v1.2.0-beta.${50 - index}`);

export default function ScrollAreaDemo() {
  return (
    <ScrollArea aria-label="Tags" class={area}>
      <div class={body}>
        <h4 class={heading}>Tags</h4>
        <For each={() => tags}>
          {(tag: string) => (
            <>
              <div class={row}>{tag}</div>
              <Separator class={rule} />
            </>
          )}
        </For>
      </div>
    </ScrollArea>
  );
}
