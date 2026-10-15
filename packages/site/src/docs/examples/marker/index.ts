import type { Demo } from "../../registry.ts";
import MarkerBorder from "./marker-border.tsx";
import markerBorder from "./marker-border.tsx?raw";
import MarkerDemo from "./marker-demo.tsx";
import markerDemo from "./marker-demo.tsx?raw";
import MarkerIconDemo from "./marker-icon.tsx";
import markerIcon from "./marker-icon.tsx?raw";
import MarkerLinkButton from "./marker-link-button.tsx";
import markerLinkButton from "./marker-link-button.tsx?raw";
import MarkerSeparator from "./marker-separator.tsx";
import markerSeparator from "./marker-separator.tsx?raw";
import MarkerShimmer from "./marker-shimmer.tsx";
import markerShimmer from "./marker-shimmer.tsx?raw";
import MarkerStatus from "./marker-status.tsx";
import markerStatus from "./marker-status.tsx?raw";
import MarkerVariants from "./marker-variants.tsx";
import markerVariants from "./marker-variants.tsx?raw";

export const demos: readonly Demo[] = [
  { size: "auto", code: markerDemo, component: MarkerDemo },
  {
    title: "Variants",
    note: "Use `variant` to switch between an inline marker, bordered row, and labeled separator.",
    size: "auto",
    code: markerVariants,
    component: MarkerVariants,
  },
  {
    title: "Status",
    note: 'Set `role="status"` and include a `Spinner` for streaming or in-progress markers so updates are announced.',
    size: "auto",
    code: markerStatus,
    component: MarkerStatus,
  },
  {
    title: "Shimmer",
    note: "Pass the `shimmer` class to `MarkerContent` for an animated streaming-text effect. It is exported by `@barqjs/ui`.",
    size: "auto",
    code: markerShimmer,
    component: MarkerShimmer,
  },
  {
    title: "Separator",
    note: "Use the `separator` variant for labeled dividers, such as dates or section breaks, in a conversation.",
    size: "auto",
    code: markerSeparator,
    component: MarkerSeparator,
  },
  {
    title: "Border",
    note: "Use the `border` variant for status rows that should keep the default marker alignment while separating the next row.",
    size: "auto",
    code: markerBorder,
    component: MarkerBorder,
  },
  {
    title: "With Icon",
    note: "Use `MarkerIcon` to render an icon alongside the content. Set `flex-direction: column` on the `Marker` to stack the icon above the content.",
    size: "auto",
    code: markerIcon,
    component: MarkerIconDemo,
  },
  {
    title: "Links and Buttons",
    note: "Put a link or a button inside `MarkerContent`. The marker underlines a link and brightens it on hover.",
    size: "auto",
    code: markerLinkButton,
    component: MarkerLinkButton,
  },
];
