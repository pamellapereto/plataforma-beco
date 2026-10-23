import { requirePrincipal } from '../../lib/auth.js';
import { readJson, sendJson } from '../../lib/http.js';

export function createApplicationsController(service) {
  return {
    async create(request, response, editionId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 201, { data: await service.createDraft(editionId, body, principal) });
    },
    async mine(request, response) {
      const principal = await requirePrincipal(request);
      const data = await service.listMine(principal);
      sendJson(response, 200, { data, meta: { total: data.length } });
    },
    async detail(request, response, applicationId) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await service.detail(applicationId, principal) });
    },
    async answers(request, response, applicationId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 200, { data: await service.saveAnswers(applicationId, body, principal) });
    },
    async submit(request, response, applicationId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 200, { data: await service.submit(applicationId, body, principal) });
    },
    async requestException(request, response, applicationId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 200, { data: await service.requestException(applicationId, body, principal) });
    },
    async cancel(request, response, applicationId) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await service.cancel(applicationId, principal) });
    }
  };
}
