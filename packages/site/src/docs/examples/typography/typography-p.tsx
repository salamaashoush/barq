import { css } from "@barqjs/css";

const p = css`
  margin: 0;
  line-height: 1.75rem;

  &:not(:first-child) {
    margin-top: calc(var(--spacing) * 6);
  }
`;

export default function TypographyP() {
  return (
    <p class={p}>
      The king, seeing how much happier his subjects were, realized the error of his ways and
      repealed the joke tax.
    </p>
  );
}
