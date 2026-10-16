import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Archive } from "@barqjs/lucide/icons/archive";
import { ArrowLeft } from "@barqjs/lucide/icons/arrow-left";
import { CalendarPlus } from "@barqjs/lucide/icons/calendar-plus";
import { Clock } from "@barqjs/lucide/icons/clock";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { ListFilter } from "@barqjs/lucide/icons/list-filter";
import { MailCheck } from "@barqjs/lucide/icons/mail-check";
import { Tag } from "@barqjs/lucide/icons/tag";
import { Trash } from "@barqjs/lucide/icons/trash";
import {
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@barqjs/ui";

const back = css`
  display: none;

  @media (min-width: 40rem) {
    display: flex;
  }
`;

const menu = css`
  width: calc(var(--spacing) * 40);
`;

export default function ButtonGroupDemo() {
  const [label, setLabel] = createSignal("personal");

  return (
    <ButtonGroup>
      <ButtonGroup class={back}>
        <Button variant="outline" size="icon" aria-label="Go Back">
          <ArrowLeft />
        </Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline">Archive</Button>
        <Button variant="outline">Report</Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline">Snooze</Button>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="outline" size="icon" aria-label="More Options">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class={menu}>
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <MailCheck />
                Mark as Read
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Archive />
                Archive
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Clock />
                Snooze
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CalendarPlus />
                Add to Calendar
              </DropdownMenuItem>
              <DropdownMenuItem>
                <ListFilter />
                Add to List
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Tag />
                  Label As...
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={label()} onValueChange={setLabel}>
                    <DropdownMenuRadioItem value="personal">Personal</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="work">Work</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="other">Other</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive">
                <Trash />
                Trash
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
    </ButtonGroup>
  );
}
