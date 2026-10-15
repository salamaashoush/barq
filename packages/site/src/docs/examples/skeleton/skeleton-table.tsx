import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Skeleton } from "@barqjs/ui";

const table = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const row = css`
  display: flex;
  gap: calc(var(--spacing) * 4);
`;

const wide = css`
  flex: 1;
  height: calc(var(--spacing) * 4);
`;

const medium = css`
  width: calc(var(--spacing) * 24);
  height: calc(var(--spacing) * 4);
`;

const narrow = css`
  width: calc(var(--spacing) * 20);
  height: calc(var(--spacing) * 4);
`;

const rows: readonly number[] = [0, 1, 2, 3, 4];

export default function SkeletonTable() {
  return (
    <div class={table}>
      <For each={() => rows}>
        {() => (
          <div class={row}>
            <Skeleton class={wide} />
            <Skeleton class={medium} />
            <Skeleton class={narrow} />
          </div>
        )}
      </For>
    </div>
  );
}
