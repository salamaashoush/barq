import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UndoDot(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
      <path d="M3 7v6h6" />
      <circle cx="12" cy="17" r="1" />
    </svg>
  );
}
