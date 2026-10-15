import { Plus } from "@barqjs/lucide/icons/plus";
import { Avatar, AvatarBadge, AvatarFallback } from "@barqjs/ui";

export default function AvatarBadgeIconExample() {
  return (
    <Avatar>
      <AvatarFallback>MK</AvatarFallback>
      <AvatarBadge>
        <Plus />
      </AvatarBadge>
    </Avatar>
  );
}
