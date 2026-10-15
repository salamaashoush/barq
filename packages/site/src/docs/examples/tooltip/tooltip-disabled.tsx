import { css } from "@barqjs/css";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@barqjs/ui";

const wrapper = css`
  display: inline-block;
  width: fit-content;
`;

export default function TooltipDisabled() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={(trigger) => (
          <span {...trigger.props} ref={trigger.ref} class={wrapper} tabIndex={0}>
            <Button variant="outline" disabled>
              Disabled
            </Button>
          </span>
        )}
      />
      <TooltipContent>
        <p>This feature is currently unavailable</p>
      </TooltipContent>
    </Tooltip>
  );
}
