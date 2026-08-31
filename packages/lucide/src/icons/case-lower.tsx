import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CaseLower(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 9v7" />
      <path d="M14 6v10" />
      <circle cx="17.5" cy="12.5" r="3.5" />
      <circle cx="6.5" cy="12.5" r="3.5" />
    </svg>
  );
}
