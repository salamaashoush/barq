import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GeorgianLari(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M11.5 21a7.5 7.5 0 1 1 7.35-9" />
      <path d="M13 12V3" />
      <path d="M4 21h16" />
      <path d="M9 12V3" />
    </svg>
  );
}
