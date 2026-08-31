import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChartNoAxesGantt(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 5h12" />
      <path d="M4 12h10" />
      <path d="M12 19h8" />
    </svg>
  );
}
