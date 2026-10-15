import { css } from "@barqjs/css";
import { Avatar, AvatarBadge, AvatarFallback } from "@barqjs/ui";

const online = css`
  background-color: oklch(62.7% 0.194 149.214);

  .dark & {
    background-color: oklch(44.8% 0.119 151.328);
  }
`;

export default function AvatarWithBadge() {
  return (
    <Avatar>
      <AvatarFallback>SA</AvatarFallback>
      <AvatarBadge class={online} />
    </Avatar>
  );
}
