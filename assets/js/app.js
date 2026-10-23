import { initializeAuth } from './controllers/auth.controller.js';
import { initializeCatalog } from './controllers/catalog.controller.js';

if (!document.querySelector('link[href="assets/data-ui.css"]')) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'assets/data-ui.css';
  document.head.append(stylesheet);
}

const rawFilename = window.location.pathname.split('/').pop() || 'index';
const filename = rawFilename.includes('.') ? rawFilename : `${rawFilename}.html`;
const page = document.body.dataset.page || ({
  'index.html': 'home',
  'feiras.html': 'fairs',
  'expositores.html': 'exhibitors',
  'feira-beco.html': 'fair-detail',
  'feira-oca.html': 'fair-detail',
  'feira-vila.html': 'fair-detail',
  'feira-reviva.html': 'fair-detail',
  'expositor.html': 'exhibitor-detail',
  'login.html': 'login',
  'area-expositor.html': 'exhibitor-dashboard',
  'curadoria.html': 'curation-dashboard'
})[filename] || '';

if (!document.querySelector('link[href="assets/workflows.css"]')) { const link=document.createElement('link');link.rel='stylesheet';link.href='assets/workflows.css';document.head.append(link); }
const canInitialize = await initializeAuth(page);
if (canInitialize !== false) {
  await initializeCatalog(page);
  if (['exhibitor-dashboard','curation-dashboard'].includes(page)) await (await import('./controllers/dashboard.controller.js')).initializeDashboard(page);
  if (page === 'application') await (await import('./controllers/application.controller.js')).initializeApplication();
}
