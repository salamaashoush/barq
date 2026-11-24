// image-blob-reduce ships no types; Excalidraw declares it the same way.
declare module "image-blob-reduce" {
  import type { Pica, PicaResizeOptions } from "pica";

  namespace ImageBlobReduce {
    interface ImageBlobReduce {
      toBlob(file: File, options: ImageBlobReduceOptions): Promise<Blob>;
      _create_blob(
        this: { pica: Pica },
        env: { out_canvas: HTMLCanvasElement; out_blob: Blob },
      ): Promise<unknown>;
    }

    interface ImageBlobReduceStatic {
      new (options?: { pica?: Pica }): ImageBlobReduce;
      (options?: { pica?: Pica }): ImageBlobReduce;
    }

    interface ImageBlobReduceOptions extends PicaResizeOptions {
      max: number;
    }
  }

  const reduce: ImageBlobReduce.ImageBlobReduceStatic;
  export = reduce;
}
