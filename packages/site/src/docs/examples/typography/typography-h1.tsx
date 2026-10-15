import { css } from "@barqjs/css";

const h1 = css`
  margin: 0;
  scroll-margin: calc(var(--spacing) * 20);
  font-size: 2.25rem;
  line-height: 2.5rem;
  font-weight: 800;
  letter-spacing: -0.025em;
  text-align: center;
  text-wrap: balance;
`;

export default function TypographyH1() {
  return <h1 class={h1}>Taxing Laughter: The Joke Tax Chronicles</h1>;
}
