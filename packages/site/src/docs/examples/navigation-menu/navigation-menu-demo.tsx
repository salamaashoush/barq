import { For, type Child, type Incoming } from "@barqjs/core";
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

const components: { title: string; href: string; description: string }[] = [
  {
    title: "Alert Dialog",
    href: "/docs/components/alert-dialog",
    description:
      "A modal dialog that interrupts the user with important content and expects a response.",
  },
  {
    title: "Hover Card",
    href: "/docs/components/hover-card",
    description: "For sighted users to preview content available behind a link.",
  },
  {
    title: "Progress",
    href: "/docs/components/progress",
    description:
      "Displays an indicator showing the completion progress of a task, typically displayed as a progress bar.",
  },
  {
    title: "Scroll-area",
    href: "/docs/components/scroll-area",
    description: "Visually or semantically separates content.",
  },
  {
    title: "Tabs",
    href: "/docs/components/tabs",
    description:
      "A set of layered sections of content—known as tab panels—that are displayed one at a time.",
  },
  {
    title: "Tooltip",
    href: "/docs/components/tooltip",
    description:
      "A popup that displays information related to an element when the element receives keyboard focus or the mouse hovers over it.",
  },
];

const single = css`
  width: calc(var(--spacing) * 96);
`;

const wide = css`
  display: none;

  @media (width >= 48rem) {
    display: flex;
  }
`;

const grid = css`
  display: grid;
  width: 400px;
  gap: calc(var(--spacing) * 2);

  @media (width >= 48rem) {
    width: 500px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (width >= 64rem) {
    width: 600px;
  }
`;

const body = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const heading = css`
  line-height: 1;
  font-weight: 500;
`;

const summary = css`
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--muted-foreground);
`;

function ListItem(props: Incoming<{ title: string; href: string; children?: Child }>) {
  return (
    <li>
      <NavigationMenuLink href={props.href()}>
        <div class={body}>
          <div class={heading}>{props.title()}</div>
          <div class={summary}>{props.children}</div>
        </div>
      </NavigationMenuLink>
    </li>
  );
}

export default function NavigationMenuDemo() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Getting started</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul class={single}>
              <ListItem href="/docs/components" title="Introduction">
                Re-usable components built with @barqjs/css.
              </ListItem>
              <ListItem href="/docs/installation" title="Installation">
                How to install dependencies and structure your app.
              </ListItem>
              <ListItem href="/docs/components/typography" title="Typography">
                Styles for headings, paragraphs, lists...etc
              </ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem class={wide}>
          <NavigationMenuTrigger>Components</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul class={grid}>
              <For each={components}>
                {(component: (typeof components)[number]) => (
                  <ListItem title={component.title} href={component.href}>
                    {component.description}
                  </ListItem>
                )}
              </For>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="/docs/components" class={navigationMenuTriggerStyle()}>
            Docs
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
