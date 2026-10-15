import type { Demo } from "../../registry.ts";
import AvatarBadgeIconExample from "./avatar-badge-icon.tsx";
import avatarBadgeIcon from "./avatar-badge-icon.tsx?raw";
import AvatarWithBadge from "./avatar-badge.tsx";
import avatarBadge from "./avatar-badge.tsx?raw";
import AvatarBasic from "./avatar-basic.tsx";
import avatarBasic from "./avatar-basic.tsx?raw";
import AvatarDemo from "./avatar-demo.tsx";
import avatarDemo from "./avatar-demo.tsx?raw";
import AvatarDropdown from "./avatar-dropdown.tsx";
import avatarDropdown from "./avatar-dropdown.tsx?raw";
import AvatarGroupCountIconExample from "./avatar-group-count-icon.tsx";
import avatarGroupCountIcon from "./avatar-group-count-icon.tsx?raw";
import AvatarGroupCountExample from "./avatar-group-count.tsx";
import avatarGroupCount from "./avatar-group-count.tsx?raw";
import AvatarGroupExample from "./avatar-group.tsx";
import avatarGroup from "./avatar-group.tsx?raw";
import AvatarRtl from "./avatar-rtl.tsx";
import avatarRtl from "./avatar-rtl.tsx?raw";
import AvatarSizeExample from "./avatar-size.tsx";
import avatarSize from "./avatar-size.tsx?raw";

export const demos: readonly Demo[] = [
  { code: avatarDemo, component: AvatarDemo },
  {
    title: "Basic",
    note: "A basic avatar. `AvatarFallback` holds the initials that stand in when there is no image.",
    code: avatarBasic,
    component: AvatarBasic,
  },
  {
    title: "Badge",
    note: "Use the `AvatarBadge` component to add a badge to the avatar. The badge sits at the bottom of the avatar on the inline end. Use the `class` prop to give it custom colors.",
    code: avatarBadge,
    component: AvatarWithBadge,
  },
  {
    title: "Badge with Icon",
    note: "You can also use an icon inside `AvatarBadge`.",
    code: avatarBadgeIcon,
    component: AvatarBadgeIconExample,
  },
  {
    title: "Avatar Group",
    note: "Use the `AvatarGroup` component to add a group of avatars.",
    code: avatarGroup,
    component: AvatarGroupExample,
  },
  {
    title: "Avatar Group Count",
    note: "Use `AvatarGroupCount` to add a count to the group.",
    code: avatarGroupCount,
    component: AvatarGroupCountExample,
  },
  {
    title: "Avatar Group with Icon",
    note: "You can also use an icon inside `AvatarGroupCount`.",
    code: avatarGroupCountIcon,
    component: AvatarGroupCountIconExample,
  },
  {
    title: "Sizes",
    note: "Use the `size` prop to change the size of the avatar.",
    code: avatarSize,
    component: AvatarSizeExample,
  },
  {
    title: "Dropdown",
    note: "You can use the `Avatar` component as a trigger for a dropdown menu. Put it inside a `Button` inside `DropdownMenuTrigger`.",
    code: avatarDropdown,
    component: AvatarDropdown,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: avatarRtl,
    component: AvatarRtl,
  },
];
