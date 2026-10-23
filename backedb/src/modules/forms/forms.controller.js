import { requirePrincipal } from '../../lib/auth.js';
import { readJson, sendJson } from '../../lib/http.js';

export function createFormsController(service) {
  return {
    async applicantForm(request, response, editionId) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await service.getForApplicant(editionId, principal) });
    },
    async adminForm(request, response, editionId) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await service.getAdmin(editionId, principal) });
    },
    async replace(request, response, editionId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 200, { data: await service.replace(editionId, body, principal) });
    }
  };
}
