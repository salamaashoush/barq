import { Plus } from "@barqjs/lucide/icons/plus";
import { Button, ButtonGroup, ButtonGroupSeparator } from "@barqjs/ui";

export default function ButtonGroupSplit() {
  return (
    <ButtonGroup>
      <Button variant="secondary">Button</Button>
      <ButtonGroupSeparator />
      <Button size="icon" variant="secondary" aria-label="Add">
        <Plus />
      </Button>
    </ButtonGroup>
  );
}
