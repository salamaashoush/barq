import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Plus(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
