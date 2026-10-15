import { css } from "@barqjs/css";

const large = css`
  font-size: 1.125rem;
  line-height: 1.75rem;
  font-weight: 600;
`;

export default function TypographyLarge() {
  return <div class={large}>Are you absolutely sure?</div>;
}
