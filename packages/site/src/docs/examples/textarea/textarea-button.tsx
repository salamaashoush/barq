import { css } from "@barqjs/css";
import { Button, Textarea } from "@barqjs/ui";

const stack = css`
  display: grid;
  width: 100%;
  max-width: 20rem;
  gap: calc(var(--spacing) * 2);
`;

export default function TextareaButton() {
  return (
    <div class={stack}>
      <Textarea placeholder="Type your message here." />
      <Button>Send message</Button>
    </div>
  );
}
