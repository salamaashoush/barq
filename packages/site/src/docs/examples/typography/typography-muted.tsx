import { css } from "@barqjs/css";

const muted = css`
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

export default function TypographyMuted() {
  return <p class={muted}>Enter your email address.</p>;
}
