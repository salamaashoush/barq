import { css } from "@barqjs/css";

const lead = css`
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.75rem;
  color: var(--muted-foreground);
`;

export default function TypographyLead() {
  return (
    <p class={lead}>
      A modal dialog that interrupts the user with important content and expects a response.
    </p>
  );
}
