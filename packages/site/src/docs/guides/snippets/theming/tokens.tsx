import { css } from "@barqjs/css";

const note = css`
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background-color: var(--muted);
  color: var(--muted-foreground);
  padding: calc(var(--spacing) * 4);
`;

export default function Note() {
  return <p class={note}>Built from the theme's tokens.</p>;
}
