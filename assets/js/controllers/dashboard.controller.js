import { exhibitorDashboard } from './exhibitor.controller.js';
import { curationDashboard } from './curation.controller.js';
import { enhanceDashboard as enhanceAdminDashboard } from '../dashboard-ui.js';
import { enhanceDashboard as enhanceExhibitorDashboard } from '../exhibitor-dashboard-ui.js';
export async function initializeDashboard(page) {
 if(page==='exhibitor-dashboard'){
  await exhibitorDashboard();
  enhanceExhibitorDashboard();
  return;
 }
 if(page==='curation-dashboard'){
  await curationDashboard();
  enhanceAdminDashboard({restoreDashboard:async()=>{await curationDashboard();enhanceAdminDashboard();}});
 }
}
