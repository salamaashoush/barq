import { css } from "@barqjs/css";

const h4 = css`
  margin: 0;
  scroll-margin: calc(var(--spacing) * 20);
  font-size: 1.25rem;
  line-height: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.025em;
`;

export default function TypographyH4() {
  return <h4 class={h4}>People stopped telling jokes</h4>;
}
