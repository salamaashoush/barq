import {
  commitEventResponse,
  composeMiddleware,
  createRequestEvent,
  createSSRResponse,
  renderToStream,
} from "@barqjs/server";
import { getRequestEvent } from "@barqjs/web";
import { provideRequestEvent } from "@barqjs/server/storage";

function App() {
  return <p>hello {String(getRequestEvent()?.locals.user)}</p>;
}

const middleware = composeMiddleware([
  async (request, next) => {
    getRequestEvent()!.locals.user = request.headers.get("x-user") ?? "salama";
    const response = await next();
    response.headers.set("x-served-by", "barq");
    return response;
  },
]);

export default {
  async fetch(request: Request): Promise<Response> {
    const event = createRequestEvent(request);
    const response = await provideRequestEvent(event, () =>
      middleware(request, () =>
        createSSRResponse(
          renderToStream(() => <App />),
          event,
        ),
      ),
    );
    return commitEventResponse(response, event);
  },
};
