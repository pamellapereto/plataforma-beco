import { requirePrincipal } from '../../lib/auth.js';
import { readJson } from '../../lib/http.js';
import { apiView } from '../../views/api.view.js';

export function createExhibitorsController(service) {
  return {
    async categories(_request, response) {
      const data = await service.categories();
      apiView.collection(response, data);
    },
    async list(_request, response, url) {
      const data = await service.listPublic({ city: url.searchParams.get('city') || undefined });
      apiView.collection(response, data);
    },
    async detail(_request, response, exhibitorId) {
      apiView.resource(response, await service.publicDetail(exhibitorId));
    },
    async adminDetail(request, response, exhibitorId) {
      const principal = await requirePrincipal(request);
      apiView.resource(response, await service.adminDetail(exhibitorId, principal));
    },
    async mine(request, response) {
      const principal = await requirePrincipal(request);
      apiView.resource(response, await service.mine(principal));
    },
    async updateMine(request, response) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      apiView.resource(response, await service.updateMine(body, principal));
    },
    async uploadUrl(request, response) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      apiView.resource(response, await service.uploadUrl(body, principal), 201);
    },
    async completeUpload(request, response) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      apiView.resource(response, await service.completeUpload(body, principal), 201);
    },
    async removePortfolioMedia(request, response, mediaAssetId) {
      const principal = await requirePrincipal(request);
      apiView.resource(response, await service.removePortfolioMedia(mediaAssetId, principal));
    }
  };
}
