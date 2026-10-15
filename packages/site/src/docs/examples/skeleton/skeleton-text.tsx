import { css } from "@barqjs/css";
import { Skeleton } from "@barqjs/ui";

const lines = css`
  display: flex;
  width: 100%;
  max-width: 20rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const full = css`
  width: 100%;
  height: calc(var(--spacing) * 4);
`;

const partial = css`
  width: 75%;
  height: calc(var(--spacing) * 4);
`;

export default function SkeletonText() {
  return (
    <div class={lines}>
      <Skeleton class={full} />
      <Skeleton class={full} />
      <Skeleton class={partial} />
    </div>
  );
}
