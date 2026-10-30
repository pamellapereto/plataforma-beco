import { requirePrincipal } from '../../lib/auth.js';
import { readJson } from '../../lib/http.js';
import { apiView } from '../../views/api.view.js';
export function createAboutController(service){return {async public(_request,response){apiView.resource(response,await service.get());},async admin(request,response){apiView.resource(response,await service.adminGet(await requirePrincipal(request)));},async update(request,response){const [principal,body]=await Promise.all([requirePrincipal(request),readJson(request)]);apiView.resource(response,await service.update(body,principal));}};}
