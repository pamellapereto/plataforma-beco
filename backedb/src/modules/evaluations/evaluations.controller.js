import { requirePrincipal } from '../../lib/auth.js';
import { readJson, sendJson } from '../../lib/http.js';

export function createEvaluationsController(service) {
  return {
    async adminEdition(request, response, editionId) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await service.editionParticipation(editionId, principal) });
    },
    async attendance(request, response, applicationId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 200, { data: await service.recordAttendance(applicationId, body, principal) });
    },
    async mine(request, response) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await service.mine(principal) });
    },
    async submit(request, response, applicationId) {
      const [principal, body] = await Promise.all([requirePrincipal(request), readJson(request)]);
      sendJson(response, 200, { data: await service.submit(applicationId, body, principal) });
    },
    async publicEdition(_request, response, slug) {
      sendJson(response, 200, { data: await service.publicEditionSummary(decodeURIComponent(slug)) });
    },
    async publicOrganization(_request, response, organizationId) {
      sendJson(response, 200, { data: await service.publicOrganizationSummary(organizationId) });
    }
  };
}
