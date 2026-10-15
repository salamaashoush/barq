import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { AudioLines } from "@barqjs/lucide/icons/audio-lines";
import { Plus } from "@barqjs/lucide/icons/plus";
import {
  Button,
  ButtonGroup,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@barqjs/ui";

const pill = css`
  --radius: 9999rem;
`;

const voice = css`
  &[aria-pressed="true"] {
    background-color: oklch(0.954 0.038 75.164);
    color: oklch(0.553 0.195 38.402);
  }

  .dark &[aria-pressed="true"] {
    background-color: oklch(0.47 0.157 37.304);
    color: oklch(0.954 0.038 75.164);
  }
`;

export default function ButtonGroupInputGroup() {
  const [voiceEnabled, setVoiceEnabled] = createSignal(false);

  return (
    <TooltipProvider>
      <ButtonGroup class={pill}>
        <ButtonGroup>
          <Button variant="outline" size="icon" aria-label="Add">
            <Plus />
          </Button>
        </ButtonGroup>
        <ButtonGroup>
          <InputGroup>
            <InputGroupInput
              aria-label="Message"
              placeholder={voiceEnabled() ? "Record and send audio..." : "Send a message..."}
              disabled={voiceEnabled()}
            />
            <InputGroupAddon align="inline-end">
              <Tooltip>
                <TooltipTrigger>
                  <InputGroupButton
                    onPress={() => setVoiceEnabled(!voiceEnabled())}
                    size="icon-xs"
                    class={voice}
                    aria-label="Voice Mode"
                    aria-pressed={voiceEnabled()}
                  >
                    <AudioLines />
                  </InputGroupButton>
                </TooltipTrigger>
                <TooltipContent>Voice Mode</TooltipContent>
              </Tooltip>
            </InputGroupAddon>
          </InputGroup>
        </ButtonGroup>
      </ButtonGroup>
    </TooltipProvider>
  );
}
