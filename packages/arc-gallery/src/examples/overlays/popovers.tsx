import { createSignal } from "@barqjs/core";
import {
  Avatar,
  AvatarFallback,
  Button,
  Field,
  FieldLabel,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Inline,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Stack,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@barqjs/arc";
import { CircleHelp } from "@barqjs/lucide/icons/circle-help";

export default function Popovers() {
  const [limit, setLimit] = createSignal("500");
  return (
    <Inline gap={4} wrap align="center">
      <Popover>
        <PopoverTrigger>
          <Button variant="outline">Rate limit: {limit()} / min</Button>
        </PopoverTrigger>
        <PopoverContent>
          <Stack gap={3}>
            <Text weight="medium">Rate limit</Text>
            <Field>
              <FieldLabel for="rate-limit">Requests per minute</FieldLabel>
              <Input
                id="rate-limit"
                type="number"
                value={limit()}
                onInput={(event) => setLimit((event.target as HTMLInputElement).value)}
              />
            </Field>
          </Stack>
        </PopoverContent>
      </Popover>

      <HoverCard openDelay={150} closeDelay={100}>
        <HoverCardTrigger>
          <Button variant="link">@salama</Button>
        </HoverCardTrigger>
        <HoverCardContent>
          <Inline gap={3} align="start">
            <Avatar>
              <AvatarFallback>SA</AvatarFallback>
            </Avatar>
            <Stack gap={1}>
              <Text weight="strong">Salama</Text>
              <Text size="sm">Owns billing and the Acme status page.</Text>
              <Text size="xs" color="muted">
                Joined March 2024
              </Text>
            </Stack>
          </Inline>
        </HoverCardContent>
      </HoverCard>

      <Tooltip>
        <TooltipTrigger>
          <Button variant="ghost" size="icon" aria-label="What is a seat?">
            <CircleHelp />
          </Button>
        </TooltipTrigger>
        <TooltipContent>One person who can sign in to the workspace</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger>
          <Button variant="outline">Tooltip below</Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Shown under its trigger</TooltipContent>
      </Tooltip>
    </Inline>
  );
}
