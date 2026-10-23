import { requirePrincipal } from '../../lib/auth.js';
import { readJson, sendJson } from '../../lib/http.js';

export function createSpacesController(service) {
  return {
    async list(request, response, editionId) {
      const principal = await requirePrincipal(request);
      const data = await service.list(editionId, principal);
      sendJson(response, 200, { data, meta: { total: data.length } });
    },
    async create(request, response, editionId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      const data = await service.create(editionId, body, principal);
      sendJson(response, 201, { data, meta: { total: data.length } });
    },
    async update(request, response, editionId, spaceId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 200, { data: await service.update(editionId, spaceId, body, principal) });
    },
    async remove(request, response, editionId, spaceId) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await service.remove(editionId, spaceId, principal) });
    },
    async assign(request, response, applicationId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 200, { data: await service.assign(applicationId, body.spaceId, principal) });
    },
    async release(request, response, applicationId) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await service.release(applicationId, principal) });
    },
    async mine(request, response) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await service.mySpace(principal) });
    }
  };
}
