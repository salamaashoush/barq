import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Bell } from "@barqjs/lucide/icons/bell";
import { Mail } from "@barqjs/lucide/icons/mail";
import { MessageSquare } from "@barqjs/lucide/icons/message-square";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@barqjs/ui";

const menu = css`
  width: calc(var(--spacing) * 48);
`;

export default function DropdownMenuCheckboxesIcons() {
  const [notifications, setNotifications] = createSignal({
    email: true,
    sms: false,
    push: true,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="outline">Notifications</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent class={menu}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Notification Preferences</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={notifications().email}
            onCheckedChange={(checked) => setNotifications({ ...notifications(), email: checked })}
          >
            <Mail />
            Email notifications
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={notifications().sms}
            onCheckedChange={(checked) => setNotifications({ ...notifications(), sms: checked })}
          >
            <MessageSquare />
            SMS notifications
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={notifications().push}
            onCheckedChange={(checked) => setNotifications({ ...notifications(), push: checked })}
          >
            <Bell />
            Push notifications
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
