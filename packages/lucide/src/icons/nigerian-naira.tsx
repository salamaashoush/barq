import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function NigerianNaira(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M4 10h16" />
      <path d="M4 14h16" />
      <path d="M6 20V4.25a.25.25 0 01.455-.143l11.09 15.786a.25.25 0 00.455-.144V4" />
    </svg>
  );
}
