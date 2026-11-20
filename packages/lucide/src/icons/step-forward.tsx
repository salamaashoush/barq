import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function StepForward(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M10.029 4.285A2 2 0 0 0 7 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z" />
      <path d="M3 4v16" />
    </svg>
  );
}
