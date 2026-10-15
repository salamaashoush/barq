import { css } from "@barqjs/css";
import { Plus } from "@barqjs/lucide/icons/plus";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@barqjs/ui";

const stack = css`
  display: flex;
  width: 100%;
  max-width: 32rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 6);
`;

const large = css`
  width: calc(var(--spacing) * 10);
  height: calc(var(--spacing) * 10);
`;

const round = css`
  border-radius: calc(infinity * 1px);
`;

export default function ItemAvatar() {
  return (
    <div class={stack}>
      <Item variant="outline">
        <ItemMedia>
          <Avatar class={large}>
            <AvatarFallback>SA</AvatarFallback>
          </Avatar>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Salama</ItemTitle>
          <ItemDescription>Last seen 5 months ago</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button size="icon-sm" variant="outline" class={round} aria-label="Invite">
            <Plus />
          </Button>
        </ItemActions>
      </Item>
      <Item variant="outline">
        <ItemMedia>
          <AvatarGroup>
            <Avatar>
              <AvatarFallback>SA</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>JA</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>JO</AvatarFallback>
            </Avatar>
          </AvatarGroup>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>No Team Members</ItemTitle>
          <ItemDescription>Invite your team to collaborate on this project.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button size="sm" variant="outline">
            Invite
          </Button>
        </ItemActions>
      </Item>
    </div>
  );
}
