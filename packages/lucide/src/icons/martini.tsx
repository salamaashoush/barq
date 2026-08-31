import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Martini(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 12 4.207 4.207A.707.707 0 0 1 4.707 3h14.586a.707.707 0 0 1 .5 1.207z" />
      <path d="M12 12v10" />
      <path d="M7 22h10" />
    </svg>
  );
}
