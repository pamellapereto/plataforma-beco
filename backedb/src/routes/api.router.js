import { config } from '../config.js';
import { notFound, sendJson } from '../lib/http.js';

function route(method, matcher, action) {
  return { method, matcher, action };
}

function paramsFor(path, matcher) {
  if (typeof matcher === 'string') return path === matcher ? [] : null;
  const match = path.match(matcher);
  return match ? match.slice(1) : null;
}

export function createApiRouter(controllers) {
  const { auth, applications, curation, exhibitors, evaluations, fairs, fairMedia, forms, media, spaces } = controllers;
  const routes = [
    route('GET', '/api/v1/health', (_req, res) => sendJson(res, 200, { data: { status: 'ok', environment: config.environment, architecture: 'MVC + Service Layer' } })),
    route('GET', '/api/v1/fair-categories', (req, res) => fairs.categories(req, res)),
    route('GET', '/api/v1/fairs', (req, res, url) => fairs.listPublic(req, res, url)),
    route('GET', '/api/v1/exhibitor-categories', (req, res) => exhibitors.categories(req, res)),
    route('GET', '/api/v1/exhibitors', (req, res, url) => exhibitors.list(req, res, url)),
    route('GET', /^\/api\/v1\/exhibitors\/([0-9a-f-]{36})$/i, (req, res, _url, id) => exhibitors.detail(req, res, id)),
    route('GET', /^\/api\/v1\/fair-editions\/([^/]+)$/i, (req, res, _url, slug) => fairs.publicEdition(req, res, slug)),
    route('GET', /^\/api\/v1\/fair-editions\/([^/]+)\/evaluation-summary$/i, (req, res, _url, slug) => evaluations.publicEdition(req, res, slug)),
    route('GET', /^\/api\/v1\/organizations\/([0-9a-f-]{36})\/evaluation-summary$/i, (req, res, _url, id) => evaluations.publicOrganization(req, res, id)),
    route('GET', /^\/api\/v1\/fair-editions\/([0-9a-f-]{36})\/form$/i, (req, res, _url, id) => forms.applicantForm(req, res, id)),
    route('POST', /^\/api\/v1\/fair-editions\/([0-9a-f-]{36})\/applications$/i, (req, res, _url, id) => applications.create(req, res, id)),

    route('POST', '/api/v1/auth/register/exhibitor', (req, res) => auth.registerExhibitor(req, res)),
    route('POST', '/api/v1/auth/login', (req, res) => auth.login(req, res)),
    route('POST', '/api/v1/auth/refresh', (req, res) => auth.refresh(req, res)),
    route('POST', '/api/v1/auth/logout', (req, res) => auth.logout(req, res)),
    route('POST', '/api/v1/auth/password/recover', (req, res) => auth.requestPasswordRecovery(req, res)),
    route('POST', '/api/v1/auth/password/update', (req, res) => auth.updatePassword(req, res)),
    route('GET', '/api/v1/auth/me', (req, res) => auth.me(req, res)),

    route('POST', '/api/v1/admin/accounts', (req, res) => auth.createAdmin(req, res)),
    route('GET', '/api/v1/admin/accounts', (req, res) => auth.listAdmins(req, res)),
    route('PATCH', /^\/api\/v1\/admin\/accounts\/([0-9a-f-]{36})\/status$/i, (req, res, _url, id) => auth.updateAdminStatus(req, res, id)),
    route('GET', '/api/v1/admin/exhibitors', (req, res, url) => auth.listExhibitors(req, res, url)),
    route('PATCH', /^\/api\/v1\/admin\/exhibitors\/([0-9a-f-]{36})\/status$/i, (req, res, _url, id) => auth.updateExhibitorStatus(req, res, id)),
    route('GET', /^\/api\/v1\/admin\/exhibitors\/([0-9a-f-]{36})$/i, (req, res, _url, id) => exhibitors.adminDetail(req, res, id)),

    route('GET', '/api/v1/me/exhibitor', (req, res) => exhibitors.mine(req, res)),
    route('PATCH', '/api/v1/me/exhibitor', (req, res) => exhibitors.updateMine(req, res)),
    route('POST', '/api/v1/me/exhibitor/portfolio/upload-url', (req, res) => exhibitors.uploadUrl(req, res)),
    route('POST', '/api/v1/me/exhibitor/portfolio', (req, res) => exhibitors.completeUpload(req, res)),
    route('DELETE', /^\/api\/v1\/me\/exhibitor\/portfolio\/([0-9a-f-]{36})$/i, (req, res, _url, id) => exhibitors.removePortfolioMedia(req, res, id)),
    route('GET', '/api/v1/me/applications', (req, res) => applications.mine(req, res)),
    route('GET', '/api/v1/me/spaces', (req, res) => spaces.mine(req, res)),
    route('GET', '/api/v1/me/evaluations', (req, res) => evaluations.mine(req, res)),
    route('PUT', /^\/api\/v1\/me\/applications\/([0-9a-f-]{36})\/evaluation$/i, (req, res, _url, id) => evaluations.submit(req, res, id)),

    route('GET', '/api/v1/admin/fairs', (req, res) => fairs.listAdmin(req, res)),
    route('POST', '/api/v1/admin/fairs', (req, res) => fairs.createFair(req, res)),
    route('PATCH', /^\/api\/v1\/admin\/fairs\/([0-9a-f-]{36})$/i, (req, res, _url, id) => fairs.updateFair(req, res, id)),
    route('POST', /^\/api\/v1\/admin\/fairs\/([0-9a-f-]{36})\/editions$/i, (req, res, _url, id) => fairs.createEdition(req, res, id)),
    route('PATCH', /^\/api\/v1\/admin\/fair-editions\/([0-9a-f-]{36})$/i, (req, res, _url, id) => fairs.updateEdition(req, res, id)),
    route('PATCH', /^\/api\/v1\/admin\/locations\/([0-9a-f-]{36})$/i, (req, res, _url, id) => fairs.updateLocation(req, res, id)),
    route('GET', /^\/api\/v1\/admin\/fair-editions\/([0-9a-f-]{36})\/form$/i, (req, res, _url, id) => forms.adminForm(req, res, id)),
    route('PUT', /^\/api\/v1\/admin\/fair-editions\/([0-9a-f-]{36})\/form$/i, (req, res, _url, id) => forms.replace(req, res, id)),
    route('GET', /^\/api\/v1\/admin\/fair-editions\/([0-9a-f-]{36})\/media$/i, (req, res, _url, id) => fairMedia.list(req, res, id)),
    route('POST', /^\/api\/v1\/admin\/fair-editions\/([0-9a-f-]{36})\/media$/i, (req, res, _url, id) => fairMedia.completeUpload(req, res, id)),
    route('POST', /^\/api\/v1\/admin\/fair-editions\/([0-9a-f-]{36})\/media\/upload-url$/i, (req, res, _url, id) => fairMedia.uploadUrl(req, res, id)),
    route('DELETE', /^\/api\/v1\/admin\/fair-editions\/([0-9a-f-]{36})\/media\/([0-9a-f-]{36})$/i, (req, res, _url, editionId, mediaId) => fairMedia.remove(req, res, editionId, mediaId)),

    route('GET', /^\/api\/v1\/curation\/fair-editions\/([0-9a-f-]{36})\/applications$/i, (req, res, url, id) => curation.list(req, res, id, url)),
    route('GET', /^\/api\/v1\/curation\/applications\/([0-9a-f-]{36})$/i, (req, res, _url, id) => curation.detail(req, res, id)),
    route('PATCH', /^\/api\/v1\/curation\/applications\/([0-9a-f-]{36})$/i, (req, res, _url, id) => curation.decide(req, res, id)),
    route('PATCH', /^\/api\/v1\/curation\/media\/([0-9a-f-]{36})$/i, (req, res, _url, id) => curation.reviewMedia(req, res, id)),
    route('PATCH', /^\/api\/v1\/curation\/exception-requests\/([0-9a-f-]{36})$/i, (req, res, _url, id) => curation.decideException(req, res, id)),
    route('GET', '/api/v1/curation/dashboard', (req, res) => curation.dashboard(req, res)),
    route('GET', /^\/api\/v1\/curation\/fair-editions\/([0-9a-f-]{36})\/spaces$/i, (req, res, _url, id) => spaces.list(req, res, id)),
    route('GET', /^\/api\/v1\/curation\/fair-editions\/([0-9a-f-]{36})\/participation$/i, (req, res, _url, id) => evaluations.adminEdition(req, res, id)),
    route('PUT', /^\/api\/v1\/curation\/applications\/([0-9a-f-]{36})\/attendance$/i, (req, res, _url, id) => evaluations.attendance(req, res, id)),
    route('POST', /^\/api\/v1\/curation\/fair-editions\/([0-9a-f-]{36})\/spaces$/i, (req, res, _url, id) => spaces.create(req, res, id)),
    route('PATCH', /^\/api\/v1\/curation\/fair-editions\/([0-9a-f-]{36})\/spaces\/([0-9a-f-]{36})$/i, (req, res, _url, editionId, spaceId) => spaces.update(req, res, editionId, spaceId)),
    route('DELETE', /^\/api\/v1\/curation\/fair-editions\/([0-9a-f-]{36})\/spaces\/([0-9a-f-]{36})$/i, (req, res, _url, editionId, spaceId) => spaces.remove(req, res, editionId, spaceId)),
    route('PUT', /^\/api\/v1\/curation\/applications\/([0-9a-f-]{36})\/space$/i, (req, res, _url, id) => spaces.assign(req, res, id)),
    route('DELETE', /^\/api\/v1\/curation\/applications\/([0-9a-f-]{36})\/space$/i, (req, res, _url, id) => spaces.release(req, res, id)),

    route('GET', /^\/api\/v1\/applications\/([0-9a-f-]{36})$/i, (req, res, _url, id) => applications.detail(req, res, id)),
    route('PUT', /^\/api\/v1\/applications\/([0-9a-f-]{36})\/answers$/i, (req, res, _url, id) => applications.answers(req, res, id)),
    route('POST', /^\/api\/v1\/applications\/([0-9a-f-]{36})\/submit$/i, (req, res, _url, id) => applications.submit(req, res, id)),
    route('PUT', /^\/api\/v1\/applications\/([0-9a-f-]{36})\/exception-request$/i, (req, res, _url, id) => applications.requestException(req, res, id)),
    route('POST', /^\/api\/v1\/applications\/([0-9a-f-]{36})\/cancel$/i, (req, res, _url, id) => applications.cancel(req, res, id)),
    route('GET', /^\/api\/v1\/applications\/([0-9a-f-]{36})\/media$/i, (req, res, _url, id) => media.list(req, res, id)),
    route('POST', /^\/api\/v1\/applications\/([0-9a-f-]{36})\/media$/i, (req, res, _url, id) => media.completeUpload(req, res, id)),
    route('POST', /^\/api\/v1\/applications\/([0-9a-f-]{36})\/media\/upload-url$/i, (req, res, _url, id) => media.createUploadUrl(req, res, id)),
    route('DELETE', /^\/api\/v1\/applications\/([0-9a-f-]{36})\/media\/([0-9a-f-]{36})$/i, (req, res, _url, applicationId, mediaId) => media.remove(req, res, applicationId, mediaId))
  ];

  return async function apiRouter(request, response, url) {
    for (const candidate of routes) {
      if (candidate.method !== request.method) continue;
      const params = paramsFor(url.pathname, candidate.matcher);
      if (params) return candidate.action(request, response, url, ...params);
    }
    return notFound(response);
  };
}
