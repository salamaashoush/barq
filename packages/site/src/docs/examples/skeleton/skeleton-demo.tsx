import { css } from "@barqjs/css";
import { Skeleton } from "@barqjs/ui";

const row = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 4);
`;

const avatar = css`
  width: calc(var(--spacing) * 12);
  height: calc(var(--spacing) * 12);
  border-radius: 9999px;
`;

const lines = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const long = css`
  width: 250px;
  height: calc(var(--spacing) * 4);
`;

const short = css`
  width: 200px;
  height: calc(var(--spacing) * 4);
`;

export default function SkeletonDemo() {
  return (
    <div class={row}>
      <Skeleton class={avatar} />
      <div class={lines}>
        <Skeleton class={long} />
        <Skeleton class={short} />
      </div>
    </div>
  );
}
