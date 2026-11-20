import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TrendingUpDown(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M14.828 14.828 21 21" />
      <path d="M21 16v5h-5" />
      <path d="m21 3-9 9-4-4-6 6" />
      <path d="M21 8V3h-5" />
    </svg>
  );
}
