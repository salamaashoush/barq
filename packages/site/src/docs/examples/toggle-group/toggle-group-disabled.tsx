import { Bold } from "@barqjs/lucide/icons/bold";
import { Italic } from "@barqjs/lucide/icons/italic";
import { Underline } from "@barqjs/lucide/icons/underline";
import { ToggleGroup, ToggleGroupItem } from "@barqjs/ui";

export default function ToggleGroupDisabled() {
  return (
    <ToggleGroup disabled type="multiple" aria-label="Text formatting">
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <Bold />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <Italic />
      </ToggleGroupItem>
      <ToggleGroupItem value="strikethrough" aria-label="Toggle strikethrough">
        <Underline />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
