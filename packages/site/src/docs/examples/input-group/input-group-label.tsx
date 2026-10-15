import { css } from "@barqjs/css";
import { Info } from "@barqjs/lucide/icons/info";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@barqjs/ui";

const frame = css`
  display: grid;
  width: 100%;
  max-width: 24rem;
  gap: calc(var(--spacing) * 4);
`;

const strong = css`
  color: var(--foreground);
`;

const help = css`
  margin-inline-start: auto;
  border-radius: 9999px;
`;

export default function InputGroupLabel() {
  return (
    <div class={frame}>
      <InputGroup>
        <InputGroupInput id="input-group-label-handle" placeholder="salama" />
        <InputGroupAddon>
          <Label for="input-group-label-handle">@</Label>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput id="input-group-label-email" placeholder="salama@example.com" />
        <InputGroupAddon align="block-start">
          <Label for="input-group-label-email" class={strong}>
            Email
          </Label>
          <Tooltip>
            <TooltipTrigger>
              <InputGroupButton variant="ghost" aria-label="Help" class={help} size="icon-xs">
                <Info />
              </InputGroupButton>
            </TooltipTrigger>
            <TooltipContent>
              <p>We'll use this to send you notifications</p>
            </TooltipContent>
          </Tooltip>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
