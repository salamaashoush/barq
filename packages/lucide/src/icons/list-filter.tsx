import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListFilter(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M2 5h20" />
      <path d="M6 12h12" />
      <path d="M9 19h6" />
    </svg>
  );
}
