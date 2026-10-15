import { Plus } from "@barqjs/lucide/icons/plus";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@barqjs/ui";

export default function AvatarGroupCountIconExample() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>SA</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>RJ</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>MK</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>
        <Plus />
      </AvatarGroupCount>
    </AvatarGroup>
  );
}
