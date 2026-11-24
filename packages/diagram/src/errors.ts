type CANVAS_ERROR_NAMES = "CANVAS_ERROR" | "CANVAS_POSSIBLY_TOO_BIG";

export class CanvasError extends Error {
  constructor(
    message: string = "Couldn't export canvas.",
    name: CANVAS_ERROR_NAMES = "CANVAS_ERROR",
  ) {
    super();
    this.name = name;
    this.message = message;
  }
}

type ImageSceneDataErrorCode = "IMAGE_NOT_CONTAINS_SCENE_DATA" | "IMAGE_SCENE_DATA_ERROR";

export class ImageSceneDataError extends Error {
  public code;
  constructor(
    message = "Image Scene Data Error",
    code: ImageSceneDataErrorCode = "IMAGE_SCENE_DATA_ERROR",
  ) {
    super(message);
    this.name = "EncodingError";
    this.code = code;
  }
}

/** A request that failed, with its HTTP status: a text-to-diagram backend's error. */
export class RequestError extends Error {
  public status: number;
  public data: unknown;

  public constructor({
    message = "Something went wrong",
    status = 500,
    data,
  }: { message?: string; status?: number; data?: unknown } = {}) {
    super(message);
    this.name = "RequestError";
    this.status = status;
    this.data = data;
  }

  public toObject(): { name: string; status: number; message: string } {
    return { name: this.name, status: this.status, message: this.message };
  }
}
