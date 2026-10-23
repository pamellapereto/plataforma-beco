import { createAuthController } from '../modules/auth/auth.controller.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { createApplicationsController } from '../modules/applications/applications.controller.js';
import { ApplicationsService } from '../modules/applications/applications.service.js';
import { createCurationController } from '../modules/curation/curation.controller.js';
import { CurationService } from '../modules/curation/curation.service.js';
import { createExhibitorsController } from '../modules/exhibitors/exhibitors.controller.js';
import { ExhibitorsService } from '../modules/exhibitors/exhibitors.service.js';
import { createFairsController } from '../modules/fairs/fairs.controller.js';
import { FairsService } from '../modules/fairs/fairs.service.js';
import { createFairMediaController } from '../modules/fair-media/fair-media.controller.js';
import { FairMediaService } from '../modules/fair-media/fair-media.service.js';
import { createFormsController } from '../modules/forms/forms.controller.js';
import { FormsService } from '../modules/forms/forms.service.js';
import { createMediaController } from '../modules/media/media.controller.js';
import { MediaService } from '../modules/media/media.service.js';
import { createSpacesController } from '../modules/spaces/spaces.controller.js';
import { SpacesService } from '../modules/spaces/spaces.service.js';
import { createEvaluationsController } from '../modules/evaluations/evaluations.controller.js';
import { EvaluationsService } from '../modules/evaluations/evaluations.service.js';
import { supabaseModel } from '../models/supabase.model.js';

export function createControllers(model = supabaseModel) {
  const formsService = new FormsService(model);
  const mediaService = new MediaService(model);
  const applicationsService = new ApplicationsService(model, formsService, mediaService);

  return {
    auth: createAuthController(new AuthService(model)),
    applications: createApplicationsController(applicationsService),
    curation: createCurationController(new CurationService(model, applicationsService)),
    exhibitors: createExhibitorsController(new ExhibitorsService(model)),
    evaluations: createEvaluationsController(new EvaluationsService(model, formsService)),
    fairs: createFairsController(new FairsService(model)),
    fairMedia: createFairMediaController(new FairMediaService(model)),
    forms: createFormsController(formsService),
    media: createMediaController(mediaService),
    spaces: createSpacesController(new SpacesService(model, formsService))
  };
}
