import { css } from "@barqjs/css";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import { Button } from "@barqjs/ui";

const rounded = css`
  border-radius: 9999px;
`;

export default function ButtonRounded() {
  return (
    <Button variant="outline" size="icon" aria-label="Submit" class={rounded}>
      <ArrowUp />
    </Button>
  );
}
