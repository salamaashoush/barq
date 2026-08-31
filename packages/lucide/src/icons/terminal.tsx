import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Terminal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 19h8" />
      <path d="m4 17 6-6-6-6" />
    </svg>
  );
}
