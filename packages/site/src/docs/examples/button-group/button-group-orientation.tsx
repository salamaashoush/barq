import { css } from "@barqjs/css";
import { Minus } from "@barqjs/lucide/icons/minus";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Button, ButtonGroup } from "@barqjs/ui";

const group = css`
  height: fit-content;
`;

export default function ButtonGroupOrientation() {
  return (
    <ButtonGroup orientation="vertical" aria-label="Media controls" class={group}>
      <Button variant="outline" size="icon" aria-label="Increase">
        <Plus />
      </Button>
      <Button variant="outline" size="icon" aria-label="Decrease">
        <Minus />
      </Button>
    </ButtonGroup>
  );
}
