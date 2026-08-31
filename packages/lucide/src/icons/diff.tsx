import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Diff(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 3v14" />
      <path d="M5 10h14" />
      <path d="M5 21h14" />
    </svg>
  );
}
