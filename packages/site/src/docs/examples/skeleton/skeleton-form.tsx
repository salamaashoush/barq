import { css } from "@barqjs/css";
import { Skeleton } from "@barqjs/ui";

const form = css`
  display: flex;
  width: 100%;
  max-width: 20rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 7);
`;

const field = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
`;

const shortLabel = css`
  width: calc(var(--spacing) * 20);
  height: calc(var(--spacing) * 4);
`;

const longLabel = css`
  width: calc(var(--spacing) * 24);
  height: calc(var(--spacing) * 4);
`;

const control = css`
  width: 100%;
  height: calc(var(--spacing) * 8);
`;

const submit = css`
  width: calc(var(--spacing) * 24);
  height: calc(var(--spacing) * 8);
`;

export default function SkeletonForm() {
  return (
    <div class={form}>
      <div class={field}>
        <Skeleton class={shortLabel} />
        <Skeleton class={control} />
      </div>
      <div class={field}>
        <Skeleton class={longLabel} />
        <Skeleton class={control} />
      </div>
      <Skeleton class={submit} />
    </div>
  );
}
