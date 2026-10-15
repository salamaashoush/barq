import { css } from "@barqjs/css";

const h3 = css`
  margin: 0;
  scroll-margin: calc(var(--spacing) * 20);
  font-size: 1.5rem;
  line-height: 2rem;
  font-weight: 600;
  letter-spacing: -0.025em;
`;

export default function TypographyH3() {
  return <h3 class={h3}>The Joke Tax</h3>;
}
