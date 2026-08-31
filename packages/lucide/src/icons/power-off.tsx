import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function PowerOff(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M18.36 6.64A9 9 0 0 1 20.77 15" />
      <path d="M6.16 6.16a9 9 0 1 0 12.68 12.68" />
      <path d="M12 2v4" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
