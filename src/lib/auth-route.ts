import { requireSession } from "./auth-session";
import { apiErrorResponse } from "./api-errors";

/** Guard at the actual handler; middleware/cookie presence is not authorization. */
export function withInventoryAuth<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      await requireSession(args[0] instanceof Request ? args[0].headers : undefined);
      const response = await handler(...args);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch (error) {
      const response = apiErrorResponse(error, "inventory authentication");
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  };
}
