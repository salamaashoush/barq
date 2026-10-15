import { css } from "@barqjs/css";
import { Avatar, AvatarFallback } from "@barqjs/ui";

const row = css`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--spacing) * 2);
`;

export default function AvatarSizeExample() {
  return (
    <div class={row}>
      <Avatar size="sm">
        <AvatarFallback>SA</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>SA</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>SA</AvatarFallback>
      </Avatar>
    </div>
  );
}
