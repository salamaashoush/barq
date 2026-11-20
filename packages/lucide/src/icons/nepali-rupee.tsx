import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function NepaliRupee(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m14 20-8-8h4c5.333 0 5.333-8 0-8" />
      <path d="M14 8c4.078 0 5.038 4.678 2.88 6.88" />
      <path d="M6 4h12" />
    </svg>
  );
}
