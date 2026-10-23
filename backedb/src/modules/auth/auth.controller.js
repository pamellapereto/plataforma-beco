import { bearerTokenFrom, requirePrincipal } from '../../lib/auth.js';
import { readJson, sendJson } from '../../lib/http.js';

export function createAuthController(authService) {
  return {
    async registerExhibitor(request, response) {
      const data = await authService.registerExhibitor(await readJson(request));
      sendJson(response, 201, { data });
    },
    async login(request, response) {
      const data = await authService.login(await readJson(request));
      sendJson(response, 200, { data });
    },
    async refresh(request, response) {
      const data = await authService.refresh(await readJson(request));
      sendJson(response, 200, { data });
    },
    async logout(request, response) {
      await authService.logout(bearerTokenFrom(request));
      sendJson(response, 204, {});
    },
    async requestPasswordRecovery(request, response) {
      await authService.requestPasswordRecovery(await readJson(request));
      sendJson(response, 202, { data: { requested: true } });
    },
    async updatePassword(request, response) {
      const data = await authService.updatePassword(await readJson(request), bearerTokenFrom(request));
      sendJson(response, 200, { data });
    },
    async me(request, response) {
      const principal = await requirePrincipal(request);
      sendJson(response, 200, { data: await authService.me(principal) });
    },
    async createAdmin(request, response) {
      const principal = await requirePrincipal(request);
      const data = await authService.createAdmin(await readJson(request), principal);
      sendJson(response, 201, { data });
    },
    async listAdmins(request, response) {
      const principal = await requirePrincipal(request);
      const data = await authService.listAdmins(principal);
      sendJson(response, 200, { data, meta: { total: data.length } });
    },
    async updateAdminStatus(request, response, accountId) {
      const principal = await requirePrincipal(request);
      const data = await authService.updateAdminStatus(accountId, await readJson(request), principal);
      sendJson(response, 200, { data });
    },
    async listExhibitors(request, response, url) {
      const principal = await requirePrincipal(request);
      const data = await authService.listExhibitors(principal, url.searchParams.get('status'));
      sendJson(response, 200, { data, meta: { total: data.length } });
    },
    async updateExhibitorStatus(request, response, exhibitorId) {
      const principal = await requirePrincipal(request);
      const data = await authService.updateExhibitorStatus(exhibitorId, await readJson(request), principal);
      sendJson(response, 200, { data });
    }
  };
}
