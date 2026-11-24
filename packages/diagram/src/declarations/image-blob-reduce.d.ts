// image-blob-reduce ships no types; Excalidraw declares it the same way.
declare module "image-blob-reduce" {
  import type { Pica, PicaResizeOptions } from "pica";

  namespace ImageBlobReduce {
    interface ReducerContext {
      pica: Pica;
    }

    interface ReducerEnv {
      out_canvas: HTMLCanvasElement;
      out_blob: Blob;
    }

    interface ImageBlobReduce {
      toBlob(file: File, options: ImageBlobReduceOptions): Promise<Blob>;
      _create_blob(this: ReducerContext, env: ReducerEnv): Promise<unknown>;
    }

    interface ReducerOptions {
      pica?: Pica;
    }

    interface ImageBlobReduceStatic {
      new (options?: ReducerOptions): ImageBlobReduce;
      (options?: ReducerOptions): ImageBlobReduce;
    }

    interface ImageBlobReduceOptions extends PicaResizeOptions {
      max: number;
    }
  }

  const reduce: ImageBlobReduce.ImageBlobReduceStatic;
  export = reduce;
}
