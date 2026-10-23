import { createControllers } from './controllers/index.js';
import { handleError, sendJson } from './lib/http.js';
import { createApiRouter } from './routes/api.router.js';

const router = createApiRouter(createControllers());

export async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (request.method === 'OPTIONS') return sendJson(response, 204, {});
    return await router(request, response, url);
  } catch (error) {
    return handleError(response, error);
  }
}
