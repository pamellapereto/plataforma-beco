let observer;
let contentObserver;
let navigationLock;
let restoreDashboard;

function setActiveLink(id) {
 document.querySelectorAll('.private-sidebar [data-admin-view]').forEach(link => {
  link.classList.remove('active');
  link.removeAttribute('aria-current');
 });
 document.querySelectorAll('.private-sidebar a[href^="#"]').forEach(link => {
  const active = link.getAttribute('href') === `#${id}`;
  link.classList.toggle('active', active);
  if (active) link.setAttribute('aria-current', 'location');
  else link.removeAttribute('aria-current');
 });
}

function setActiveEditor(view) {
 document.querySelectorAll('.private-sidebar a[href^="#"]').forEach(link => {
  link.classList.remove('active');
  link.removeAttribute('aria-current');
 });
 document.querySelectorAll('.private-sidebar [data-admin-view]').forEach(link => {
  const active = link.dataset.adminView === view;
  link.classList.toggle('active', active);
  if (active) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
 });
 const group = document.querySelector('.private-nav-group');
 if (group) group.open = true;
}

function decoratePanels(main) {
 main.querySelectorAll(':scope > .panel').forEach((panel, index) => {
  panel.classList.add('dashboard-panel');
  panel.style.setProperty('--panel-order', index);
  const heading = panel.querySelector(':scope > h2, :scope > .workflow-section-heading h2, :scope > .panel-title h2');
  if (heading && panel.id && !heading.querySelector('.panel-anchor')) {
   const anchor = document.createElement('a');
   anchor.className = 'panel-anchor';
   anchor.href = `#${panel.id}`;
   anchor.setAttribute('aria-label', `Link direto para ${heading.textContent.trim()}`);
   anchor.textContent = '#';
   heading.append(anchor);
  }
 });
}

function installScrollSpy(main) {
 if (observer) observer.disconnect();
 const sections = [...main.querySelectorAll('.panel[id]')];
 observer = new IntersectionObserver(entries => {
  if (navigationLock) return;
  const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visible) setActiveLink(visible.target.id);
 }, { rootMargin: '-18% 0px -68% 0px', threshold: [0, .2, .6] });
 sections.forEach(section => observer.observe(section));
}

function installSectionNavigation() {
 const sidebar = document.querySelector('.private-sidebar');
 if (!sidebar || sidebar.dataset.sectionNavigation === 'ready') return;
 sidebar.dataset.sectionNavigation = 'ready';
 sidebar.addEventListener('click', async event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  let target = document.querySelector(link.getAttribute('href'));
  if (!target && restoreDashboard) {
   event.preventDefault();
   await restoreDashboard();
   target = document.querySelector(link.getAttribute('href'));
  }
  if (!target) return;
  event.preventDefault();
  const id = target.id;
  setActiveLink(id);
  navigationLock = id;
  history.replaceState(null, '', `#${id}`);
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => { navigationLock = null; setActiveLink(id); }, 700);
 });
}

async function openAdminEditor(view) {
 const main = document.querySelector('.private-main');
 if (!main) return;
 if (observer) observer.disconnect();
 main.removeAttribute('data-home-editor');
 main.removeAttribute('data-about-editor');
 main.innerHTML = '<div class="editor-loading" role="status"><span class="data-spinner" aria-hidden="true"></span><p>Carregando área de edição…</p></div>';
 setActiveEditor(view);
 if (view === 'home') {
  main.setAttribute('data-home-editor', '');
  history.replaceState(null, '', '#editar-inicio');
  const { initializeHomepageEditor } = await import('./controllers/homepage.controller.js');
  await initializeHomepageEditor();
 } else {
  main.setAttribute('data-about-editor', '');
  history.replaceState(null, '', '#editar-sobre');
  const { initializeAboutEditor } = await import('./controllers/about.controller.js');
  await initializeAboutEditor();
 }
 decoratePanels(main);
 window.scrollTo({ top: 0, behavior: 'smooth' });
}

function installAdminViewNavigation() {
 const sidebar = document.querySelector('.private-sidebar');
 if (!sidebar || sidebar.dataset.adminViews === 'ready') return;
 sidebar.dataset.adminViews = 'ready';
 sidebar.addEventListener('click', event => {
  const link = event.target.closest('[data-admin-view]');
  if (!link) return;
  event.preventDefault();
  openAdminEditor(link.dataset.adminView);
  document.body.classList.remove('private-menu-open');
  document.querySelector('.private-menu-toggle')?.setAttribute('aria-expanded', 'false');
 });
}

function installMobileNavigation() {
 const sidebar = document.querySelector('.private-sidebar');
 if (!sidebar || document.querySelector('.private-menu-toggle')) return;
 const button = document.createElement('button');
 button.type = 'button';
 button.className = 'private-menu-toggle';
 button.setAttribute('aria-controls', 'private-navigation');
 button.setAttribute('aria-expanded', 'false');
 button.innerHTML = '<span aria-hidden="true">☰</span><span>Menu</span>';
 sidebar.id = 'private-navigation';
 document.body.prepend(button);
 const close = () => { document.body.classList.remove('private-menu-open'); button.setAttribute('aria-expanded', 'false'); };
 button.addEventListener('click', () => {
  const open = document.body.classList.toggle('private-menu-open');
  button.setAttribute('aria-expanded', String(open));
 });
 sidebar.addEventListener('click', event => { if (event.target.closest('a')) close(); });
 document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
}

function installBackToTop() {
 if (document.querySelector('.back-to-top')) return;
 const link = document.createElement('a');
 link.className = 'back-to-top';
 link.href = '#conteudo';
 link.setAttribute('aria-label', 'Voltar ao início do painel');
 link.textContent = '↑';
 document.body.append(link);
 const update = () => link.classList.toggle('is-visible', window.scrollY > 600);
 window.addEventListener('scroll', update, { passive: true });
 update();
}

export function enhanceDashboard(options={}) {
 const main = document.querySelector('.private-main');
 if (!main) return;
 if (options.restoreDashboard) restoreDashboard=options.restoreDashboard;
 decoratePanels(main);
 installScrollSpy(main);
 installSectionNavigation();
 installAdminViewNavigation();
 installMobileNavigation();
 installBackToTop();
 if (!contentObserver) {
  contentObserver = new MutationObserver(() => {
   if (!main.querySelector('.panel:not(.dashboard-panel)')) return;
   decoratePanels(main);
   installScrollSpy(main);
  });
  contentObserver.observe(main, { childList: true, subtree: true });
 }
}
