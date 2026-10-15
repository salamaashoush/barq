import { css } from "@barqjs/css";
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@barqjs/ui";

const row = css`
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  gap: calc(var(--spacing) * 6);

  @media (width >= 48rem) {
    gap: calc(var(--spacing) * 12);
  }
`;

const online = css`
  background-color: oklch(62.7% 0.194 149.214);

  .dark & {
    background-color: oklch(44.8% 0.119 151.328);
  }
`;

export default function AvatarDemo() {
  return (
    <div class={row}>
      <Avatar>
        <AvatarFallback>SA</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>MK</AvatarFallback>
        <AvatarBadge class={online} />
      </Avatar>
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
    </div>
  );
}
