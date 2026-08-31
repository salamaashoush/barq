import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Columns4(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M7.5 3v18" />
      <path d="M12 3v18" />
      <path d="M16.5 3v18" />
    </svg>
  );
}
