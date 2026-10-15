import { css } from "@barqjs/css";

const code = css`
  position: relative;
  border-radius: 0.25rem;
  background-color: var(--muted);
  padding: 0.2rem 0.3rem;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 600;
`;

export default function TypographyInlineCode() {
  return <code class={code}>@barqjs/ui</code>;
}
