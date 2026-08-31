import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GalleryVerticalEnd(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M7 2h10" />
      <path d="M5 6h14" />
      <rect width="18" height="12" x="3" y="10" rx="2" />
    </svg>
  );
}
