import { css } from "@barqjs/css";

const h2 = css`
  margin: 0;
  scroll-margin: calc(var(--spacing) * 20);
  border-bottom: 1px solid var(--border);
  padding-bottom: calc(var(--spacing) * 2);
  font-size: 1.875rem;
  line-height: 2.25rem;
  font-weight: 600;
  letter-spacing: -0.025em;
`;

export default function TypographyH2() {
  return <h2 class={h2}>The People of the Kingdom</h2>;
}
