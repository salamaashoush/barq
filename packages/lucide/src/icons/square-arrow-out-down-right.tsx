import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowOutDownRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
      <path d="m21 21-9-9" />
      <path d="M21 15v6h-6" />
    </svg>
  );
}
