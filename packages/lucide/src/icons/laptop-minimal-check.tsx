import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LaptopMinimalCheck(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 20h20" />
      <path d="m9 10 2 2 4-4" />
      <rect x="3" y="4" width="18" height="12" rx="2" />
    </svg>
  );
}
