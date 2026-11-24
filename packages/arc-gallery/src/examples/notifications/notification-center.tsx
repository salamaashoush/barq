import { Inline, NotificationCenter, Status, Text, toast, useNotifications } from "@barqjs/arc";

import { recentNotifications } from "../../data/notifications.ts";

export default function NotificationCenterExample() {
  const feed = useNotifications({
    initial: recentNotifications(Date.now()).map((item) =>
      item.id === "n-1"
        ? {
            ...item,
            actions: [
              {
                id: "review",
                label: "Review",
                onAction: () => toast.info("Opening the pull request"),
              },
              {
                id: "decline",
                label: "Decline",
                tone: "danger" as const,
                onAction: (declined) => {
                  feed.remove(declined.id);
                  toast("Review declined", { description: "Lina will be told." });
                },
              },
            ],
          }
        : item,
    ),
    stream: { url: "/api/notifications" },
  });

  return (
    <Inline gap={4} align="center" wrap>
      <NotificationCenter
        items={feed.items()}
        onMarkRead={(ids, read) => feed.markRead(ids, read)}
        onMarkAllRead={feed.markAllRead}
        allHref="#notification-feed"
        preferencesHref="#notification-feed"
      />
      <Status
        tone={feed.connection() === "open" ? "success" : "warning"}
        pulse={feed.connection() === "open"}
      >
        {feed.connection() === "open" ? "Live, a new one every 6 seconds" : "Connecting"}
      </Status>
      <Text size="sm" color="muted">
        {feed.unread()} unread of {feed.items().length}
      </Text>
    </Inline>
  );
}
