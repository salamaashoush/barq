import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GalleryThumbnails(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="18" height="14" x="3" y="3" rx="2" />
      <path d="M4 21h1" />
      <path d="M9 21h1" />
      <path d="M14 21h1" />
      <path d="M19 21h1" />
    </svg>
  );
}
