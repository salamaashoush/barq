import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function PanelsLeftBottom(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="M9 15h12" />
    </svg>
  );
}
