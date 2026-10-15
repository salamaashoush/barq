import { css } from "@barqjs/css";
import { Skeleton } from "@barqjs/ui";

const row = css`
  display: flex;
  width: fit-content;
  align-items: center;
  gap: calc(var(--spacing) * 4);
`;

const avatar = css`
  width: calc(var(--spacing) * 10);
  height: calc(var(--spacing) * 10);
  flex-shrink: 0;
  border-radius: 9999px;
`;

const lines = css`
  display: grid;
  gap: calc(var(--spacing) * 2);
`;

const long = css`
  width: 150px;
  height: calc(var(--spacing) * 4);
`;

const short = css`
  width: 100px;
  height: calc(var(--spacing) * 4);
`;

export default function SkeletonAvatar() {
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
