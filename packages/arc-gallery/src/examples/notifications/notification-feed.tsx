import { createSignal } from "@barqjs/core";
import {
  Button,
  EmptyState,
  Inline,
  Label,
  type NotificationItem,
  NotificationFeed,
  Stack,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
  useNotifications,
} from "@barqjs/arc";
import { surface, space } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";
import { Inbox } from "@barqjs/lucide/icons/inbox";

import { recentNotifications } from "../../data/notifications.ts";

const demo = layer("demo");
const panel = demo(surface.card, { padding: space.x3, maxWidth: "36rem" });

const older = (now: number, page: number): NotificationItem[] =>
  Array.from({ length: 3 }, (_, index) => ({
    id: `older-${page}-${index}`,
    title:
      ["Weekly usage report is ready", "Nour joined the Support team", "Status page published"][
        index
      ] ?? "",
    source: ["Reports", "Workspace", "Status page"][index],
    createdAt: new Date(now - (8 + page * 3 + index) * 86_400_000).toISOString(),
    read: true,
  }));

export default function NotificationFeedExample() {
  const feed = useNotifications({ initial: recentNotifications(Date.now()) });
  const [groupBy, setGroupBy] = createSignal<"day" | "source" | "none">("day");
  const [loading, setLoading] = createSignal(false);
  const [pages, setPages] = createSignal(0);
  const [loadingMore, setLoadingMore] = createSignal(false);

  const loadMore = (): void => {
    setLoadingMore(true);
    setTimeout(() => {
      const page = pages() + 1;
      feed.replace([...feed.items(), ...older(Date.now(), page)]);
      setPages(page);
      setLoadingMore(false);
    }, 600);
  };

  return (
    <Stack gap={4}>
      <Inline gap={4} align="center" wrap>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Group by"
          value={groupBy()}
          onValueChange={(value: string | string[]) => {
            if (value === "day" || value === "source" || value === "none") setGroupBy(value);
          }}
        >
          <ToggleGroupItem value="day">By day</ToggleGroupItem>
          <ToggleGroupItem value="source">By source</ToggleGroupItem>
          <ToggleGroupItem value="none">Ungrouped</ToggleGroupItem>
        </ToggleGroup>
        <Inline gap={2} align="center">
          <Switch id="feed-loading" checked={loading()} onCheckedChange={setLoading} />
          <Label for="feed-loading">Loading</Label>
        </Inline>
        <Button variant="outline" size="sm" onPress={() => feed.replace([])}>
          Clear all
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => feed.replace(recentNotifications(Date.now()))}
        >
          Reset
        </Button>
      </Inline>
      <div class={panel} id="notification-feed">
        <NotificationFeed
          items={feed.items()}
          groupBy={groupBy()}
          isLoading={loading()}
          onMarkRead={(ids, read) => feed.markRead(ids, read)}
          onMarkAllRead={feed.markAllRead}
          onLoadMore={pages() < 2 ? loadMore : undefined}
          isLoadingMore={loadingMore()}
          empty={
            <EmptyState
              icon={<Inbox />}
              heading="No notifications yet"
              description="Deploys, mentions and billing events for Acme show up here."
            />
          }
        />
      </div>
    </Stack>
  );
}
