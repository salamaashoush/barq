import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Tombstone(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M11 10h2" />
      <path d="M19 21V10a7 7 0 00-14 0v11" />
      <path d="M2 21h20" />
      <path d="M9 14h6" />
    </svg>
  );
}
