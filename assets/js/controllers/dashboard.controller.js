import { exhibitorDashboard } from './exhibitor.controller.js';
import { curationDashboard } from './curation.controller.js';
export async function initializeDashboard(page) {
 if(page==='exhibitor-dashboard')await exhibitorDashboard();
 if(page==='curation-dashboard')await curationDashboard();
}
