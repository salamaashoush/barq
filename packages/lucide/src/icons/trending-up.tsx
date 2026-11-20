import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TrendingUp(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </svg>
  );
}
