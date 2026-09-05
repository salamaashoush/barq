/**
 * The components with no state and no keyboard model: what they look like IS
 * what they are.
 *
 * One exported component per example, because a demo is a Block and the page
 * places it with `<Dynamic />`. The `code` beside each in `../index.ts` is what
 * the card shows, and it is the demo's own source rather than a paraphrase of
 * it — a snippet that does not compile to what is on screen is worse than none.
 */

import { css } from "@barqjs/css";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import { BadgeCheck } from "@barqjs/lucide/icons/badge-check";
import { Bold } from "@barqjs/lucide/icons/bold";
import { CircleAlert } from "@barqjs/lucide/icons/circle-alert";
import { Mail } from "@barqjs/lucide/icons/mail";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AspectRatio,
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  Badge,
  Button,
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Kbd,
  KbdGroup,
  Label,
  Progress,
  Separator,
  Skeleton,
  Spinner,
} from "@barqjs/ui";

import { row, stack } from "./shared.ts";

/** Upstream's own `button-demo`: an outline button and an outline icon button. */
export function ButtonDemo() {
  return (
    <div class={row}>
      <Button variant="outline">Button</Button>
      <Button variant="outline" size="icon" aria-label="Submit">
        <ArrowUp />
      </Button>
    </div>
  );
}

export function ButtonVariants() {
  return (
    <div class={row}>
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  );
}

export function ButtonSizes() {
  return (
    <div class={row}>
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Large</Button>
    </div>
  );
}

export function ButtonIcon() {
  return (
    <div class={row}>
      <Button size="icon-sm" aria-label="Bold">
        <Bold />
      </Button>
      <Button size="icon" aria-label="Bold">
        <Bold />
      </Button>
      <Button size="icon-lg" variant="outline" aria-label="Bold">
        <Bold />
      </Button>
    </div>
  );
}

export function ButtonWithIcon() {
  return (
    <div class={row}>
      <Button variant="outline">
        <Mail />
        Email
      </Button>
      <Button>
        Continue
        <ArrowRight />
      </Button>
    </div>
  );
}

export function ButtonLoading() {
  return (
    <div class={row}>
      <Button isDisabled>
        <Spinner />
        Saving
      </Button>
      <Button variant="outline" isDisabled>
        Disabled
      </Button>
    </div>
  );
}

export function ButtonGroupDemo() {
  return (
    <ButtonGroup>
      <Button variant="outline">Copy</Button>
      <Button variant="outline">Paste</Button>
      <ButtonGroupSeparator />
      <Button variant="outline">Delete</Button>
    </ButtonGroup>
  );
}

export function ButtonGroupText_() {
  return (
    <ButtonGroup>
      <ButtonGroupText>https://</ButtonGroupText>
      <Button variant="outline">example.com</Button>
    </ButtonGroup>
  );
}

export function BadgeDemo() {
  return <Badge>Badge</Badge>;
}

export function BadgeVariants() {
  return (
    <div class={row}>
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="ghost">Ghost</Badge>
    </div>
  );
}

export function BadgeWithIcon() {
  return (
    <div class={row}>
      <Badge variant="secondary">
        <BadgeCheck />
        Verified
      </Badge>
      <Badge variant="destructive">
        <CircleAlert />
        Failed
      </Badge>
    </div>
  );
}

export function BadgeLink() {
  return (
    <Badge variant="link" href="#">
      Read the changelog
    </Badge>
  );
}

const cardWidth = css`
  width: 100%;
  max-width: 22rem;
`;

export function CardDemo() {
  return (
    <Card class={cardWidth}>
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
        <CardDescription>Everything billed this year.</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline">
            New
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>Twelve invoices, four of them unpaid.</CardContent>
      <CardFooter>
        <Button size="sm">Export</Button>
      </CardFooter>
    </Card>
  );
}

export function CardBordered() {
  return (
    <Card class={cardWidth}>
      <CardHeader bordered>
        <CardTitle>Usage</CardTitle>
        <CardDescription>Against this month's allowance.</CardDescription>
      </CardHeader>
      <CardContent>
        <Progress value={62} label="Requests" />
      </CardContent>
      <CardFooter bordered>
        <Button size="sm" variant="outline">
          Upgrade
        </Button>
      </CardFooter>
    </Card>
  );
}

export function AlertDemo() {
  return (
    <Alert>
      <TriangleAlert />
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>Your trial ends in three days.</AlertDescription>
    </Alert>
  );
}

export function AlertDestructive() {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>Payment failed</AlertTitle>
      <AlertDescription>The card was declined.</AlertDescription>
    </Alert>
  );
}

export function AlertTitleOnly() {
  return (
    <Alert>
      <BadgeCheck />
      <AlertTitle>Everything is up to date.</AlertTitle>
    </Alert>
  );
}

const separated = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
  width: 100%;
  max-width: 20rem;
`;

const inline = css`
  display: flex;
  height: calc(var(--spacing) * 5);
  align-items: center;
  gap: calc(var(--spacing) * 3);
  font-size: 0.875rem;
`;

export function SeparatorDemo() {
  return (
    <div class={separated}>
      <div>
        <div style={{ "font-weight": "500" }}>@barqjs/ui</div>
        <p style={{ color: "var(--muted-foreground)", "font-size": "0.875rem", margin: "0" }}>
          Components you can own.
        </p>
      </div>
      <Separator />
      <div class={inline}>
        <span>Docs</span>
        <Separator orientation="vertical" />
        <span>Blocks</span>
        <Separator orientation="vertical" />
        <span>Colors</span>
      </div>
    </div>
  );
}

const skeletonCard = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 4);
`;

const skeletonLines = css`
  display: grid;
  gap: calc(var(--spacing) * 2);
`;

export function SkeletonDemo() {
  return (
    <div class={skeletonCard}>
      <Skeleton style={{ width: "3rem", height: "3rem", "border-radius": "9999px" }} />
      <div class={skeletonLines}>
        <Skeleton style={{ width: "12rem", height: "1rem" }} />
        <Skeleton style={{ width: "9rem", height: "1rem" }} />
      </div>
    </div>
  );
}

export function SpinnerDemo() {
  return (
    <div class={row}>
      <Spinner />
      <Button isDisabled>
        <Spinner />
        Please wait
      </Button>
    </div>
  );
}

export function KbdDemo() {
  return (
    <div class={row}>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
      <KbdGroup>
        <Kbd>Ctrl</Kbd>
        <Kbd>Shift</Kbd>
        <Kbd>P</Kbd>
      </KbdGroup>
    </div>
  );
}

const ratio = css`
  width: 100%;
  max-width: 28rem;
`;

const ratioBody = css`
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  background-color: var(--muted);
  font-size: 0.875rem;
  color: var(--muted-foreground);
`;

export function AspectRatioDemo() {
  return (
    <div class={ratio}>
      <AspectRatio ratio={16 / 9}>
        <div class={ratioBody}>16 / 9</div>
      </AspectRatio>
    </div>
  );
}

export function AvatarDemo() {
  return (
    <div class={row}>
      <Avatar>
        <AvatarFallback>SA</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>MK</AvatarFallback>
      </Avatar>
    </div>
  );
}

export function AvatarGroupDemo() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>SA</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>MK</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>RJ</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+4</AvatarGroupCount>
    </AvatarGroup>
  );
}

export function ProgressDemo() {
  return (
    <div class={stack}>
      <Progress value={62} label="Upload" />
      <Progress value={18} label="Index" />
    </div>
  );
}

export function LabelDemo() {
  return (
    <div class={stack}>
      <Label for="terms-label">Accept the terms and conditions</Label>
      <p style={{ color: "var(--muted-foreground)", "font-size": "0.875rem", margin: "0" }}>
        A label names the control it is `for`, and clicking it moves focus there.
      </p>
    </div>
  );
}
