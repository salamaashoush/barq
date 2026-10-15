import type { Demo } from "../../registry.ts";
import EmptyAvatar from "./empty-avatar.tsx";
import emptyAvatar from "./empty-avatar.tsx?raw";
import EmptyAvatarGroup from "./empty-avatar-group.tsx";
import emptyAvatarGroup from "./empty-avatar-group.tsx?raw";
import EmptyBackground from "./empty-background.tsx";
import emptyBackground from "./empty-background.tsx?raw";
import EmptyDemo from "./empty-demo.tsx";
import emptyDemo from "./empty-demo.tsx?raw";
import EmptyInputGroup from "./empty-input-group.tsx";
import emptyInputGroup from "./empty-input-group.tsx?raw";
import EmptyOutline from "./empty-outline.tsx";
import emptyOutline from "./empty-outline.tsx?raw";
import EmptyRtl from "./empty-rtl.tsx";
import emptyRtl from "./empty-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    size: "auto",
    code: emptyDemo,
    component: EmptyDemo,
  },
  {
    title: "Outline",
    note: "Give `Empty` a class with a dashed `border` to create an outline empty state.",
    size: "auto",
    code: emptyOutline,
    component: EmptyOutline,
  },
  {
    title: "Background",
    note: "Give `Empty` a class with a `background` to tint the empty state.",
    size: "auto",
    code: emptyBackground,
    component: EmptyBackground,
  },
  {
    title: "Avatar",
    note: "Use the `EmptyMedia` component to display an avatar in the empty state.",
    size: "auto",
    code: emptyAvatar,
    component: EmptyAvatar,
  },
  {
    title: "Avatar Group",
    note: "Use the `EmptyMedia` component to display an avatar group in the empty state.",
    size: "auto",
    code: emptyAvatarGroup,
    component: EmptyAvatarGroup,
  },
  {
    title: "InputGroup",
    note: "You can add an `InputGroup` component to the `EmptyContent` component.",
    size: "auto",
    code: emptyInputGroup,
    component: EmptyInputGroup,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    size: "auto",
    rtl: true,
    code: emptyRtl,
    component: EmptyRtl,
  },
];
