import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Reply(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
      <path d="m9 17-5-5 5-5" />
    </svg>
  );
}
