import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UsbCPort(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M6 12h12" />
      <rect x="2" y="8" width="20" height="8" rx="4" />
    </svg>
  );
}
