import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Check(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
