import type { Demos } from "../../gallery/types.ts";
import InviteLinks from "./invite-links.tsx";
import inviteLinks from "./invite-links.tsx?raw";
import MemberInvite from "./member-invite.tsx";
import memberInvite from "./member-invite.tsx?raw";
import PendingInvites from "./pending-invites.tsx";
import pendingInvites from "./pending-invites.tsx?raw";
import AccountTheme from "./account-theme.tsx";
import accountTheme from "./account-theme.tsx?raw";
import CalendarFeed from "./calendar-feed.tsx";
import calendarFeed from "./calendar-feed.tsx?raw";
import NotificationPreferences from "./notification-preferences.tsx";
import notificationPreferences from "./notification-preferences.tsx?raw";
import SettingRows from "./setting-rows.tsx";
import settingRows from "./setting-rows.tsx?raw";
import SettingsLayout from "./settings-layout.tsx";
import settingsLayout from "./settings-layout.tsx?raw";

export const demos: Demos = {
  "settings-layout": { component: SettingsLayout, code: settingsLayout },
  "setting-rows": { component: SettingRows, code: settingRows },
  "notification-preferences": { component: NotificationPreferences, code: notificationPreferences },
  "calendar-feed": { component: CalendarFeed, code: calendarFeed },
  "account-theme": { component: AccountTheme, code: accountTheme },
  "member-invite": { component: MemberInvite, code: memberInvite },
  "pending-invites": { component: PendingInvites, code: pendingInvites },
  "invite-links": { component: InviteLinks, code: inviteLinks },
};
