import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Plus } from "@barqjs/lucide/icons/plus";
import {
  Avatar,
  AvatarFallback,
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@barqjs/ui";

const group = css`
  max-width: 24rem;
`;

const text = css`
  gap: var(--spacing);
`;

const round = css`
  border-radius: calc(infinity * 1px);
`;

interface Person {
  readonly username: string;
  readonly email: string;
}

const people: readonly Person[] = [
  { username: "salama", email: "salama@example.com" },
  { username: "jane", email: "jane@example.com" },
  { username: "john", email: "john@example.com" },
];

export default function ItemGroupExample() {
  return (
    <ItemGroup class={group}>
      <For each={() => people}>
        {(person: Person) => (
          <Item variant="outline">
            <ItemMedia>
              <Avatar>
                <AvatarFallback>{person.username.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
            </ItemMedia>
            <ItemContent class={text}>
              <ItemTitle>{person.username}</ItemTitle>
              <ItemDescription>{person.email}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="ghost"
                size="icon"
                class={round}
                aria-label={`Invite ${person.username}`}
              >
                <Plus />
              </Button>
            </ItemActions>
          </Item>
        )}
      </For>
    </ItemGroup>
  );
}
