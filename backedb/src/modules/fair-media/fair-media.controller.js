import { requirePrincipal } from '../../lib/auth.js';
import { readJson, sendJson } from '../../lib/http.js';

export function createFairMediaController(service) {
  return {
    async list(request, response, editionId) {
      const principal = await requirePrincipal(request);
      const data = await service.list(editionId, principal);
      sendJson(response, 200, { data, meta: { total: data.length } });
    },
    async uploadUrl(request, response, editionId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 201, { data: await service.createUploadUrl(editionId, body, principal) });
    },
    async completeUpload(request, response, editionId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 201, { data: await service.completeUpload(editionId, body, principal) });
    },
    async remove(request, response, editionId, mediaId) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await service.remove(editionId, mediaId, principal) });
    }
  };
}
