import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SignalZero(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 20h.01" />
    </svg>
  );
}
