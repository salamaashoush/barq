import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GapHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 2v2" />
      <path d="M12 8v2" />
      <path d="M12 14v2" />
      <path d="M12 20v2" />
      <path d="M21 3h-3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
      <path d="M3 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3" />
    </svg>
  );
}
