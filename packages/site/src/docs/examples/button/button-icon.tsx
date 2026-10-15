import { CircleFadingArrowUp } from "@barqjs/lucide/icons/circle-fading-arrow-up";
import { Button } from "@barqjs/ui";

export default function ButtonIcon() {
  return (
    <Button variant="outline" size="icon" aria-label="Upload">
      <CircleFadingArrowUp />
    </Button>
  );
}
