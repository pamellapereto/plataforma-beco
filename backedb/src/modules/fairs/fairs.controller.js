import { requirePrincipal } from '../../lib/auth.js';
import { readJson } from '../../lib/http.js';
import { apiView } from '../../views/api.view.js';

export function createFairsController(service) {
  return {
    async categories(_request, response) {
      const data = await service.categories();
      apiView.collection(response, data);
    },
    async listPublic(_request, response, url) {
      const data = await service.list({ city: url.searchParams.get('city') || undefined });
      apiView.collection(response, data);
    },
    async publicEdition(_request, response, slug) {
      apiView.resource(response, await service.publicEdition(decodeURIComponent(slug)));
    },
    async listAdmin(request, response) {
      const principal = await requirePrincipal(request);
      apiView.resource(response, await service.list({ admin: true, principal }));
    },
    async createFair(request, response) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      apiView.resource(response, await service.createFair(body, principal), 201);
    },
    async updateFair(request, response, fairId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      apiView.resource(response, await service.updateFair(fairId, body, principal));
    },
    async createEdition(request, response, fairId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      apiView.resource(response, await service.createEdition(fairId, body, principal), 201);
    },
    async updateEdition(request, response, editionId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      apiView.resource(response, await service.updateEdition(editionId, body, principal));
    },
    async updateLocation(request, response, locationId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      apiView.resource(response, await service.updateLocation(locationId, body, principal));
    }
  };
}
