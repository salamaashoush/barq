import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Clock8(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l-4 2" />
    </svg>
  );
}
