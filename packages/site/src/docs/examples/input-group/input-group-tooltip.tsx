import { css } from "@barqjs/css";
import { CircleQuestionMark } from "@barqjs/lucide/icons/circle-question-mark";
import { Info } from "@barqjs/lucide/icons/info";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
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

export default function InputGroupTooltip() {
  return (
    <div class={frame}>
      <InputGroup>
        <InputGroupInput aria-label="Password" placeholder="Enter password" type="password" />
        <InputGroupAddon align="inline-end">
          <Tooltip>
            <TooltipTrigger>
              <InputGroupButton variant="ghost" aria-label="Info" size="icon-xs">
                <Info />
              </InputGroupButton>
            </TooltipTrigger>
            <TooltipContent>
              <p>Password must be at least 8 characters</p>
            </TooltipContent>
          </Tooltip>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Email" placeholder="Your email address" />
        <InputGroupAddon align="inline-end">
          <Tooltip>
            <TooltipTrigger>
              <InputGroupButton variant="ghost" aria-label="Help" size="icon-xs">
                <CircleQuestionMark />
              </InputGroupButton>
            </TooltipTrigger>
            <TooltipContent>
              <p>We'll use this to send you notifications</p>
            </TooltipContent>
          </Tooltip>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="API key" placeholder="Enter API key" />
        <InputGroupAddon>
          <Tooltip>
            <TooltipTrigger>
              <InputGroupButton variant="ghost" aria-label="API key help" size="icon-xs">
                <CircleQuestionMark />
              </InputGroupButton>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Click for help with API keys</p>
            </TooltipContent>
          </Tooltip>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
