import { css } from "@barqjs/css";
import { Spinner } from "@barqjs/ui";

const row = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 6);
`;

const small = css`
  width: calc(var(--spacing) * 3);
  height: calc(var(--spacing) * 3);
`;

const regular = css`
  width: calc(var(--spacing) * 4);
  height: calc(var(--spacing) * 4);
`;

const large = css`
  width: calc(var(--spacing) * 6);
  height: calc(var(--spacing) * 6);
`;

const larger = css`
  width: calc(var(--spacing) * 8);
  height: calc(var(--spacing) * 8);
`;

export default function SpinnerSize() {
  return (
    <div class={row}>
      <Spinner class={small} />
      <Spinner class={regular} />
      <Spinner class={large} />
      <Spinner class={larger} />
    </div>
  );
}
