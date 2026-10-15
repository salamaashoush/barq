import type { Demo } from "../../registry.ts";
import BadgeCustomColors from "./badge-colors.tsx";
import badgeColors from "./badge-colors.tsx?raw";
import BadgeDemo from "./badge-demo.tsx";
import badgeDemo from "./badge-demo.tsx?raw";
import BadgeWithIconLeft from "./badge-icon.tsx";
import badgeIcon from "./badge-icon.tsx?raw";
import BadgeAsLink from "./badge-link.tsx";
import badgeLink from "./badge-link.tsx?raw";
import BadgeRtl from "./badge-rtl.tsx";
import badgeRtl from "./badge-rtl.tsx?raw";
import BadgeWithSpinner from "./badge-spinner.tsx";
import badgeSpinner from "./badge-spinner.tsx?raw";
import BadgeVariants from "./badge-variants.tsx";
import badgeVariants from "./badge-variants.tsx?raw";

export const demos: readonly Demo[] = [
  { code: badgeDemo, component: BadgeDemo },
  {
    title: "Variants",
    note: "Use the `variant` prop to change the variant of the badge.",
    code: badgeVariants,
    component: BadgeVariants,
  },
  {
    title: "With Icon",
    note: 'You can render an icon inside the badge. Use `data-icon="inline-start"` on an icon before the text and `data-icon="inline-end"` on an icon after it, so the badge tightens its padding on that side.',
    code: badgeIcon,
    component: BadgeWithIconLeft,
  },
  {
    title: "With Spinner",
    note: "You can render a spinner inside the badge, before or after the text.",
    code: badgeSpinner,
    component: BadgeWithSpinner,
  },
  {
    title: "Link",
    note: "Use the `href` prop to render the badge as a link. The badge is the `<a>` element.",
    code: badgeLink,
    component: BadgeAsLink,
  },
  {
    title: "Custom Colors",
    note: "You can customize the colors of a badge by passing a `class` that sets its background and text colors. A `.dark &` rule covers dark mode.",
    code: badgeColors,
    component: BadgeCustomColors,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: badgeRtl,
    component: BadgeRtl,
  },
];
