import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveDiagonal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M11 19H5v-6" />
      <path d="M13 5h6v6" />
      <path d="M19 5 5 19" />
    </svg>
  );
}
