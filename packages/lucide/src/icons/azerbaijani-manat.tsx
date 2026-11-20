import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AzerbaijaniManat(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 4v16" />
      <path d="M18 20v-8a6 6 0 00-12 0v8" />
    </svg>
  );
}
