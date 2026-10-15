import { css } from "@barqjs/css";
import { Plus } from "@barqjs/lucide/icons/plus";
import {
  Avatar,
  AvatarFallback,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@barqjs/ui";

const stack = css`
  display: flex;

  & > [data-slot="avatar"] {
    width: calc(var(--spacing) * 12);
    height: calc(var(--spacing) * 12);
    box-shadow: 0 0 0 2px var(--background);
  }

  & > [data-slot="avatar"]:not(:first-child) {
    margin-inline-start: calc(var(--spacing) * -2);
  }
`;

export default function EmptyAvatarGroup() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <div class={stack}>
            <Avatar>
              <AvatarFallback>SA</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>AC</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>EX</AvatarFallback>
            </Avatar>
          </div>
        </EmptyMedia>
        <EmptyTitle>No Team Members</EmptyTitle>
        <EmptyDescription>Invite your team to collaborate on this project.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm">
          <Plus />
          Invite Members
        </Button>
      </EmptyContent>
    </Empty>
  );
}
