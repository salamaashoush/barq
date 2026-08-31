import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Refrigerator(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 6a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z" />
      <path d="M5 10h14" />
      <path d="M15 7v6" />
    </svg>
  );
}
