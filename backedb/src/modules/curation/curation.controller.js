import { requirePrincipal } from '../../lib/auth.js';
import { readJson, sendJson } from '../../lib/http.js';

export function createCurationController(service) {
  return {
    async list(request, response, editionId, url) {
      const principal = await requirePrincipal(request);
      const data = await service.list(editionId, { status: url.searchParams.get('status') }, principal);
      sendJson(response, 200, { data, meta: { total: data.length } });
    },
    async detail(request, response, applicationId) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await service.detail(applicationId, principal) });
    },
    async decide(request, response, applicationId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 200, { data: await service.decide(applicationId, body, principal) });
    },
    async reviewMedia(request, response, mediaId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 200, { data: await service.reviewMedia(mediaId, body, principal) });
    },
    async decideException(request, response, requestId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 200, { data: await service.decideException(requestId, body, principal) });
    },
    async dashboard(request, response) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await service.dashboard(principal) });
    }
  };
}
