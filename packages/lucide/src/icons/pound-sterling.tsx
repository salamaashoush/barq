import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function PoundSterling(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M18 7c0-5.333-8-5.333-8 0" />
      <path d="M10 7v14" />
      <path d="M6 21h12" />
      <path d="M6 13h10" />
    </svg>
  );
}
