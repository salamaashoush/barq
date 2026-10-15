import { Save } from "@barqjs/lucide/icons/save";
import { Button, Kbd, Tooltip, TooltipContent, TooltipTrigger } from "@barqjs/ui";

export default function TooltipKeyboard() {
  return (
    <Tooltip>
      <TooltipTrigger>
        <Button variant="outline" size="icon-sm" aria-label="Save">
          <Save />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Save Changes <Kbd>S</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
