import { readJson, sendJson } from '../../lib/http.js';
import { requirePrincipal } from '../../lib/auth.js';

export function createMediaController(mediaService) {
  return {
    async createUploadUrl(request, response, applicationId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      const data = await mediaService.createUploadUrl(applicationId, principal, body);
      sendJson(response, 201, { data });
    },
    async completeUpload(request, response, applicationId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      const data = await mediaService.completeUpload(applicationId, principal, body);
      sendJson(response, 201, { data });
    },
    async list(request, response, applicationId) {
      const principal = await requirePrincipal(request);
      const data = await mediaService.listApplicationMedia(applicationId, principal);
      sendJson(response, 200, { data, meta: { total: data.length } });
    },
    async remove(request, response, applicationId, mediaAssetId) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await mediaService.removeApplicationMedia(applicationId, mediaAssetId, principal) });
    }
  };
}
