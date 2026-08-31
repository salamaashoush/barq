import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CirclePlay(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
