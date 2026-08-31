import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GalleryHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M2 3v18" />
      <rect width="12" height="18" x="6" y="3" rx="2" />
      <path d="M22 3v18" />
    </svg>
  );
}
