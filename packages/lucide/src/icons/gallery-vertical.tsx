import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GalleryVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M3 2h18" />
      <rect width="18" height="12" x="3" y="6" rx="2" />
      <path d="M3 22h18" />
    </svg>
  );
}
