import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function HandleBottomRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M21 8 8 21" />
      <path d="m21 15-6 6" />
    </svg>
  );
}
