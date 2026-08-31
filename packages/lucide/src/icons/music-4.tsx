import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Music4(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 18V5l12-2v13" />
      <path d="m9 9 12-2" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}
