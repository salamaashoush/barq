import { css } from "@barqjs/css";
import { Button, Kbd } from "@barqjs/ui";

const nudged = css`
  translate: calc(var(--spacing) * 0.5) 0;
`;

export default function KbdButton() {
  return (
    <Button variant="outline">
      Accept <Kbd class={nudged}>⏎</Kbd>
    </Button>
  );
}
