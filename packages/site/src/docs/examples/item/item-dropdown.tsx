import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@barqjs/ui";

const menu = css`
  width: 12rem;
`;

const row = css`
  width: 100%;
  padding: calc(var(--spacing) * 2);
`;

const small = css`
  width: calc(var(--spacing) * 6.5);
  height: calc(var(--spacing) * 6.5);
`;

const text = css`
  gap: 0;
`;

const tight = css`
  line-height: 1;
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

export default function ItemDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="outline">
          Select <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent class={menu} align="end">
        <DropdownMenuGroup>
          <For each={() => people}>
            {(person: Person) => (
              <DropdownMenuItem textValue={person.username}>
                <Item size="xs" class={row}>
                  <ItemMedia>
                    <Avatar class={small}>
                      <AvatarFallback>{person.username.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </ItemMedia>
                  <ItemContent class={text}>
                    <ItemTitle>{person.username}</ItemTitle>
                    <ItemDescription class={tight}>{person.email}</ItemDescription>
                  </ItemContent>
                </Item>
              </DropdownMenuItem>
            )}
          </For>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
