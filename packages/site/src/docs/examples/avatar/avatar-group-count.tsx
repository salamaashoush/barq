import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@barqjs/ui";

export default function AvatarGroupCountExample() {
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
      <AvatarGroupCount>+3</AvatarGroupCount>
    </AvatarGroup>
  );
}
