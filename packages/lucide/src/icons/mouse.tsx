import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Mouse(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect x="5" y="2" width="14" height="20" rx="7" />
      <path d="M12 6v4" />
    </svg>
  );
}
