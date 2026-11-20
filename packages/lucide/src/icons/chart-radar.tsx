import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChartRadar(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 2v10" />
      <path d="m16 18 3.085-8.125L12 4.103 3.473 9.442l3.196 10.554z" />
      <path d="m2 9 10 3 6 9" />
      <path d="m6 21 6-9 10-3" />
    </svg>
  );
}
