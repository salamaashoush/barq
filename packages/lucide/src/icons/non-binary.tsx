import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function NonBinary(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 2v10" />
      <path d="m8.5 4 7 4" />
      <path d="m8.5 8 7-4" />
      <circle cx="12" cy="17" r="5" />
    </svg>
  );
}
