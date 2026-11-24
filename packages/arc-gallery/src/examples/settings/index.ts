import type { Demos } from "../../gallery/types.ts";
import InviteLinks from "./invite-links.tsx";
import inviteLinks from "./invite-links.tsx?raw";
import MemberInvite from "./member-invite.tsx";
import memberInvite from "./member-invite.tsx?raw";
import PendingInvites from "./pending-invites.tsx";
import pendingInvites from "./pending-invites.tsx?raw";
import SettingsLayout from "./settings-layout.tsx";
import settingsLayout from "./settings-layout.tsx?raw";

export const demos: Demos = {
  "settings-layout": { component: SettingsLayout, code: settingsLayout },
  "member-invite": { component: MemberInvite, code: memberInvite },
  "pending-invites": { component: PendingInvites, code: pendingInvites },
  "invite-links": { component: InviteLinks, code: inviteLinks },
};
