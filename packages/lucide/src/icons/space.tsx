import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Space(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1" />
    </svg>
  );
}
