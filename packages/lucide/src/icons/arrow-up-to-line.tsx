import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowUpToLine(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 3h14" />
      <path d="m18 13-6-6-6 6" />
      <path d="M12 7v14" />
    </svg>
  );
}
