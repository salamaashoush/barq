import { css } from "@barqjs/css";

const small = css`
  font-size: 0.875rem;
  line-height: 1;
  font-weight: 500;
`;

export default function TypographySmall() {
  return <small class={small}>Email address</small>;
}
