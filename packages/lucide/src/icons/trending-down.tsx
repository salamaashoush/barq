import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TrendingDown(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M16 17h6v-6" />
      <path d="m22 17-8.5-8.5-5 5L2 7" />
    </svg>
  );
}
