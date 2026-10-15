import {
  Button,
  ButtonGroup,
  Kbd,
  KbdGroup,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@barqjs/ui";

export default function KbdTooltip() {
  return (
    <ButtonGroup>
      <Tooltip>
        <TooltipTrigger>
          <Button variant="outline">Save</Button>
        </TooltipTrigger>
        <TooltipContent>
          Save Changes <Kbd>S</Kbd>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>
          <Button variant="outline">Print</Button>
        </TooltipTrigger>
        <TooltipContent>
          Print Document{" "}
          <KbdGroup>
            <Kbd>Ctrl</Kbd>
            <Kbd>P</Kbd>
          </KbdGroup>
        </TooltipContent>
      </Tooltip>
    </ButtonGroup>
  );
}
