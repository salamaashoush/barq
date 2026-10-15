import { css } from "@barqjs/css";

const blockquote = css`
  margin: calc(var(--spacing) * 6) 0 0;
  border-inline-start: 2px solid var(--border);
  padding-inline-start: calc(var(--spacing) * 6);
  font-style: italic;
`;

export default function TypographyBlockquote() {
  return (
    <blockquote class={blockquote}>
      "After all," he said, "everyone enjoys a good joke, so it's only fair that they should pay for
      the privilege."
    </blockquote>
  );
}
