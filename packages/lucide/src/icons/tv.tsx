import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Tv(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m17 2-5 5-5-5" />
      <rect width="20" height="15" x="2" y="7" rx="2" />
    </svg>
  );
}
