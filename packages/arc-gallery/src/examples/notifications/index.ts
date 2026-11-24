import type { Demos } from "../../gallery/types.ts";
import NotificationCenter from "./notification-center.tsx";
import notificationCenter from "./notification-center.tsx?raw";
import NotificationFeed from "./notification-feed.tsx";
import notificationFeed from "./notification-feed.tsx?raw";
import Presence from "./presence.tsx";
import presence from "./presence.tsx?raw";
import Toasts from "./toasts.tsx";
import toasts from "./toasts.tsx?raw";

export const demos: Demos = {
  "notification-center": { component: NotificationCenter, code: notificationCenter },
  "notification-feed": { component: NotificationFeed, code: notificationFeed },
  toasts: { component: Toasts, code: toasts },
  presence: { component: Presence, code: presence },
};
