import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Bluetooth(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m7 7 10 10-5 5V2l5 5L7 17" />
    </svg>
  );
}
