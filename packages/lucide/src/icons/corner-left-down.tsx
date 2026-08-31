import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CornerLeftDown(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m14 15-5 5-5-5" />
      <path d="M20 4h-7a4 4 0 0 0-4 4v12" />
    </svg>
  );
}
