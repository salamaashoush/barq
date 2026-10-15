import { Italic } from "@barqjs/lucide/icons/italic";
import { Toggle } from "@barqjs/ui";

export default function ToggleText() {
  return (
    <Toggle aria-label="Toggle italic">
      <Italic />
      Italic
    </Toggle>
  );
}
