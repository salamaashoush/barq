/**
 * A 2D context that records what is drawn, for a DOM (happy-dom) that has no
 * canvas. Text is measured at half the font size per character, so wrapping
 * and layout are deterministic. `toBlob` encodes a real one-pixel PNG of the
 * canvas's type, so a PNG export can be read back.
 */

import { deflate } from "pako";

import { encodeChunks } from "./data/png.ts";

export interface Call {
  name: string;
  args: unknown[];
  /** The fill and stroke style in force when the call was made. */
  fillStyle: unknown;
  strokeStyle: unknown;
  font: unknown;
}

export class RecordingContext {
  public readonly calls: Call[] = [];
  public fillStyle: unknown = "#000000";
  public strokeStyle: unknown = "#000000";
  public font = "10px sans-serif";
  public lineWidth = 1;
  public globalAlpha = 1;
  public textAlign = "start";
  public textBaseline = "alphabetic";
  public direction = "inherit";
  public lineCap = "butt";
  public lineJoin = "miter";
  public filter = "none";
  public imageSmoothingEnabled = true;
  public imageSmoothingQuality = "low";
  public globalCompositeOperation = "source-over";
  public miterLimit = 10;
  public lineDashOffset = 0;
  public shadowBlur = 0;
  public shadowColor = "transparent";
  public letterSpacing = "0px";
  private dash: number[] = [];
  private stack: Record<string, unknown>[] = [];

  public constructor(public readonly canvas: HTMLCanvasElement) {}

  public measureText(text: string): TextMetrics {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
    const width = text.length * size * 0.5;
    return {
      width,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: width,
      actualBoundingBoxAscent: size * 0.8,
      actualBoundingBoxDescent: size * 0.2,
      fontBoundingBoxAscent: size * 0.8,
      fontBoundingBoxDescent: size * 0.2,
      alphabeticBaseline: 0,
      emHeightAscent: size * 0.8,
      emHeightDescent: size * 0.2,
      hangingBaseline: size * 0.8,
      ideographicBaseline: -size * 0.2,
    };
  }

  public setLineDash(segments: number[]): void {
    this.dash = [...segments];
    this.record("setLineDash", [segments]);
  }

  public getLineDash(): number[] {
    return [...this.dash];
  }

  public save(): void {
    this.stack.push({
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      font: this.font,
      globalAlpha: this.globalAlpha,
      lineWidth: this.lineWidth,
    });
    this.record("save", []);
  }

  public restore(): void {
    Object.assign(this, this.stack.pop() ?? {});
    this.record("restore", []);
  }

  public createLinearGradient(): CanvasGradient {
    return { addColorStop: () => undefined };
  }

  public createRadialGradient(): CanvasGradient {
    return { addColorStop: () => undefined };
  }

  public createPattern(): CanvasPattern | null {
    return null;
  }

  public getImageData(_x: number, _y: number, width: number, height: number): ImageData {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) } as ImageData;
  }

  public getTransform(): DOMMatrix {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix;
  }

  public isPointInPath(): boolean {
    return false;
  }

  public record(name: string, args: unknown[]): void {
    this.calls.push({
      name,
      args,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      font: this.font,
    });
  }

  /** The recorded calls by name. */
  public named(name: string): Call[] {
    return this.calls.filter((call) => call.name === name);
  }
}

const DRAWING = [
  "arc",
  "arcTo",
  "beginPath",
  "bezierCurveTo",
  "clearRect",
  "clip",
  "closePath",
  "drawImage",
  "ellipse",
  "fill",
  "fillRect",
  "fillText",
  "lineTo",
  "moveTo",
  "putImageData",
  "quadraticCurveTo",
  "rect",
  "resetTransform",
  "rotate",
  "roundRect",
  "scale",
  "setTransform",
  "stroke",
  "strokeRect",
  "strokeText",
  "transform",
  "translate",
] as const;

for (const name of DRAWING) {
  Object.defineProperty(RecordingContext.prototype, name, {
    value(this: RecordingContext, ...args: unknown[]) {
      this.record(name, args);
    },
  });
}

const contexts = new WeakMap<HTMLCanvasElement, RecordingContext>();

/** The context a canvas has drawn into, made on first use. */
export function contextOf(canvas: HTMLCanvasElement): RecordingContext {
  let context = contexts.get(canvas);
  if (context === undefined) {
    context = new RecordingContext(canvas);
    contexts.set(canvas, context);
  }
  return context;
}

function onePixelPng(): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, 1);
  view.setUint32(4, 1);
  header[8] = 8;
  header[9] = 6;
  return encodeChunks([
    { name: "IHDR", data: header },
    { name: "IDAT", data: deflate(new Uint8Array([0, 0, 0, 0, 0])) },
    { name: "IEND", data: new Uint8Array(0) },
  ]);
}

class TestPath2D {
  public constructor(public readonly path?: string) {}
}

interface CanvasPrototype {
  getContext: (this: HTMLCanvasElement, type: string) => unknown;
  toBlob: (this: HTMLCanvasElement, callback: (blob: Blob | null) => void, type?: string) => void;
  toDataURL: (this: HTMLCanvasElement) => string;
}

interface Path2DGlobal {
  Path2D?: unknown;
}

export function installCanvas(): void {
  const proto = HTMLCanvasElement.prototype as unknown as CanvasPrototype;
  proto.getContext = function getContext(type) {
    return type === "2d" ? contextOf(this) : null;
  };
  proto.toBlob = function toBlob(callback, type = "image/png") {
    setTimeout(() => callback(new Blob([onePixelPng()], { type })), 0);
  };
  proto.toDataURL = () => `data:image/png;base64,${btoa(String.fromCharCode(...onePixelPng()))}`;
  (globalThis as Path2DGlobal).Path2D ??= TestPath2D;
}
