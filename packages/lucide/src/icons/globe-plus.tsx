import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GlobePlus(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15.929 10.563A14.5 14.5 0 0112 22a1 1 0 010-20 15 15 0 01.68.768" />
      <path d="M19 2v6" />
      <path d="M21.92 10.734A10 10 0 0112 22a14.5 14.5 0 010-20 10 10 0 011.266.08" />
      <path d="M22 12H2" />
      <path d="M22 5h-6" />
    </svg>
  );
}
