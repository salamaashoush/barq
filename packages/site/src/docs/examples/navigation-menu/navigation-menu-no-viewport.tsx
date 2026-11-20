import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@barqjs/ui";

const list = css`
  width: calc(var(--spacing) * 72);
`;

const column = css`
  display: flex;
  flex-direction: column;
`;

const heading = css`
  font-weight: 500;
`;

const summary = css`
  color: var(--muted-foreground);
`;

const links = [
  { title: "Components", description: "Browse all components in the library." },
  { title: "Documentation", description: "Learn how to use the library." },
  { title: "Blog", description: "Read our latest blog posts." },
];

export default function NavigationMenuNoViewport() {
  return (
    <NavigationMenu viewport={false}>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink href="/docs" class={navigationMenuTriggerStyle()}>
            Documentation
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>List</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul class={list}>
              <li>
                <For each={links}>
                  {(link: (typeof links)[number]) => (
                    <NavigationMenuLink href="#">
                      <div class={column}>
                        <div class={heading}>{link.title}</div>
                        <div class={summary}>{link.description}</div>
                      </div>
                    </NavigationMenuLink>
                  )}
                </For>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Simple List</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul>
              <li>
                <NavigationMenuLink href="#">Components</NavigationMenuLink>
                <NavigationMenuLink href="#">Documentation</NavigationMenuLink>
                <NavigationMenuLink href="#">Blocks</NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
