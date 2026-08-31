import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Contrast(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 18a6 6 0 0 0 0-12v12z" />
    </svg>
  );
}
