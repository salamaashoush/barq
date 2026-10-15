import { css } from "@barqjs/css";
import { Bell } from "@barqjs/lucide/icons/bell";
import { RefreshCcw } from "@barqjs/lucide/icons/refresh-ccw";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@barqjs/ui";

const tinted = css`
  height: 100%;
  background-color: color-mix(in oklab, var(--muted) 30%, transparent);
`;

const narrow = css`
  max-width: 20rem;
  text-wrap: pretty;
`;

export default function EmptyBackground() {
  return (
    <Empty class={tinted}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Bell />
        </EmptyMedia>
        <EmptyTitle>No Notifications</EmptyTitle>
        <EmptyDescription class={narrow}>
          You're all caught up. New notifications will appear here.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline">
          <RefreshCcw />
          Refresh
        </Button>
      </EmptyContent>
    </Empty>
  );
}
