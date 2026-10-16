import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Bridge(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 9.728V16" />
      <path d="M14 9.728V16" />
      <path d="M18 20V4" />
      <path d="m22 11-4-4A7.5 7.5 0 0 1 6 7l-4 4" />
      <path d="M22 16H2" />
      <path d="M6 20V4" />
    </svg>
  );
}
