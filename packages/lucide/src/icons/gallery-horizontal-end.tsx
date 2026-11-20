import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GalleryHorizontalEnd(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 7v10" />
      <path d="M6 5v14" />
      <rect width="12" height="18" x="10" y="3" rx="2" />
    </svg>
  );
}
