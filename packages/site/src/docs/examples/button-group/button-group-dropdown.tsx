import { css } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Share } from "@barqjs/lucide/icons/share";
import { Trash } from "@barqjs/lucide/icons/trash";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";
import { UserRoundX } from "@barqjs/lucide/icons/user-round-x";
import { VolumeOff } from "@barqjs/lucide/icons/volume-off";
import {
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barqjs/ui";

const chevron = css`
  padding-inline-start: calc(var(--spacing) * 2);
`;

const menu = css`
  width: calc(var(--spacing) * 44);
`;

export default function ButtonGroupDropdown() {
  return (
    <ButtonGroup>
      <Button variant="outline">Follow</Button>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button variant="outline" class={chevron} aria-label="More actions">
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class={menu}>
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <VolumeOff />
              Mute Conversation
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Check />
              Mark as Read
            </DropdownMenuItem>
            <DropdownMenuItem>
              <TriangleAlert />
              Report Conversation
            </DropdownMenuItem>
            <DropdownMenuItem>
              <UserRoundX />
              Block User
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Share />
              Share Conversation
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy />
              Copy Conversation
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive">
              <Trash />
              Delete Conversation
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
