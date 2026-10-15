import { AudioLines } from "@barqjs/lucide/icons/audio-lines";
import { Plus } from "@barqjs/lucide/icons/plus";
import {
  Button,
  ButtonGroup,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@barqjs/ui";

export default function ButtonGroupNested() {
  return (
    <TooltipProvider>
      <ButtonGroup>
        <ButtonGroup>
          <Button variant="outline" size="icon" aria-label="Add">
            <Plus />
          </Button>
        </ButtonGroup>
        <ButtonGroup>
          <InputGroup>
            <InputGroupInput placeholder="Send a message..." aria-label="Message" />
            <InputGroupAddon align="inline-end">
              <Tooltip>
                <TooltipTrigger
                  render={(trigger) => (
                    <span {...trigger.props} ref={trigger.ref}>
                      <AudioLines size={16} />
                    </span>
                  )}
                />
                <TooltipContent>Voice Mode</TooltipContent>
              </Tooltip>
            </InputGroupAddon>
          </InputGroup>
        </ButtonGroup>
      </ButtonGroup>
    </TooltipProvider>
  );
}
