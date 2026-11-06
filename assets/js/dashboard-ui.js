let observer;
let contentObserver;
let navigationLock;
let restoreDashboard;
let currentDashboardView = 'overview';

const dashboardViews = {
 overview: { title: 'Visão geral', description: 'Acompanhe prioridades da operação e acesse rapidamente cada área do trabalho.' },
 fairs: { title: 'Feiras e edições', description: 'Cadastre feiras, organize edições e prepare formulários, datas e materiais.' },
 applications: { title: 'Inscrições e curadoria', description: 'Trabalhe dentro de uma edição, compare candidaturas e acompanhe a diversidade da seleção.' },
 exhibitors: { title: 'Expositores', description: 'Consulte cadastros, situação dos perfis e portfólios enviados.' },
 spaces: { title: 'Espaços da edição', description: 'Organize a ocupação e atribua espaços para a edição selecionada.' },
 attendance: { title: 'Presença e avaliações', description: 'Registre comparecimento e acompanhe as avaliações após o evento.' }
};

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

function setActiveDashboardView(view) {
 document.querySelectorAll('.private-sidebar [data-admin-view]').forEach(link => {
  link.classList.remove('active');
  link.removeAttribute('aria-current');
 });
 document.querySelectorAll('.private-sidebar [data-dashboard-view]').forEach(link => {
  const active = link.dataset.dashboardView === view;
  link.classList.toggle('active', active);
  if (active) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
 });
 const activeLink = document.querySelector(`.private-sidebar [data-dashboard-view="${view}"]`);
 activeLink?.closest('details')?.setAttribute('open', '');
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

function decorateEditionWorkspace(main) {
 const panel = main.querySelector('#inscricoes');
 const select = panel?.querySelector('[data-edition]');
 if (!panel || !select || panel.querySelector('[data-edition-context]')) return;
 panel.classList.add('edition-dashboard');
 const originalTitle = panel.querySelector(':scope > h2');
 if (originalTitle) originalTitle.textContent = 'Inscrições e curadoria';
 const context = document.createElement('div');
 context.className = 'edition-context';
 context.dataset.editionContext = '';
 context.innerHTML = '<div><span class="eyebrow">Edição em análise</span><h2 data-edition-name></h2><p>Todos os indicadores, filtros e decisões abaixo pertencem a esta edição.</p></div><div class="edition-context__controls"></div>';
 const selectLabel = select.closest('label');
 context.querySelector('[data-edition-name]').textContent = select.selectedOptions[0]?.textContent?.split(' · ')[0] || 'Selecione uma edição';
 context.querySelector('.edition-context__controls').append(selectLabel);
 panel.prepend(context);
 const quickNav = document.createElement('div');
 quickNav.className = 'edition-quick-nav';
 quickNav.innerHTML = '<button type="button" class="btn btn-secondary" data-dashboard-view="spaces">Espaços desta edição</button><button type="button" class="btn btn-secondary" data-dashboard-view="attendance">Presença e avaliações</button>';
 context.after(quickNav);
}

function decorateFairEditions(main) {
 main.querySelectorAll('#feiras [data-edit-edition]').forEach(editButton => {
  const editionCard = editButton.closest('.workflow-question');
  if (!editionCard || editionCard.querySelector('[data-open-edition]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-small btn-primary';
  button.dataset.openEdition = editButton.dataset.editEdition;
  button.textContent = 'Abrir painel da edição';
  editionCard.querySelector('.hero-actions')?.prepend(button);
 });
}

function buildDashboardOverview(main) {
 if (main.querySelector('[data-dashboard-overview]')) return;
 const selectedEdition = main.querySelector('[data-edition]')?.selectedOptions[0]?.textContent || 'Nenhuma edição selecionada';
 const overview = document.createElement('section');
 overview.className = 'dashboard-overview';
 overview.dataset.dashboardOverview = '';
 overview.innerHTML = `<div class="overview-intro"><span class="eyebrow">Organização do trabalho</span><h2>O que você precisa fazer agora?</h2><p>Acesse cada módulo sem percorrer uma página longa. A edição ativa conecta curadoria, espaços e pós-evento.</p></div><div class="overview-edition"><span>Edição ativa</span><strong>${selectedEdition}</strong><button type="button" class="btn btn-primary" data-dashboard-view="applications">Abrir curadoria da edição</button></div><div class="overview-actions"><button type="button" data-dashboard-view="fairs"><span>01</span><b>Feiras e edições</b><small>Cadastro, configuração e publicação</small></button><button type="button" data-dashboard-view="applications"><span>02</span><b>Inscrições e curadoria</b><small>Diversidade, seleção e análise</small></button><button type="button" data-dashboard-view="exhibitors"><span>03</span><b>Expositores</b><small>Perfis e portfólios</small></button><button type="button" data-dashboard-view="spaces"><span>04</span><b>Espaços</b><small>Organização da edição ativa</small></button></div>`;
 const stats = main.querySelector('.dash-stats');
 stats?.after(overview);
}

function applyDashboardView(view, { scroll = true } = {}) {
 const main = document.querySelector('.private-main');
 if (!main || !main.querySelector('#inscricoes')) return;
 currentDashboardView = dashboardViews[view] ? view : 'overview';
 const panelByView = { fairs: 'feiras', applications: 'inscricoes', exhibitors: 'expositores', spaces: 'espacos', attendance: 'presencas' };
 main.removeAttribute('data-home-editor');
 main.removeAttribute('data-about-editor');
 main.dataset.dashboardView = currentDashboardView;
 main.querySelectorAll(':scope > .panel').forEach(panel => { panel.hidden = panel.id !== panelByView[currentDashboardView]; });
 const overview = main.querySelector('[data-dashboard-overview]');
 if (overview) overview.hidden = currentDashboardView !== 'overview';
 const stats = main.querySelector('.dash-stats');
 if (stats) stats.hidden = currentDashboardView !== 'overview';
 const meta = dashboardViews[currentDashboardView];
 const heading = main.querySelector('.private-heading');
 if (heading) {
  const title = heading.querySelector('h1');
  const description = heading.querySelector('p');
  if (title) title.textContent = meta.title;
  if (description) description.textContent = meta.description;
 }
 setActiveDashboardView(currentDashboardView);
 history.replaceState(null, '', currentDashboardView === 'overview' ? '#visao-geral' : `#${panelByView[currentDashboardView]}`);
 if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
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
  if (link.matches('[data-dashboard-view]')) return;
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

async function openDashboardView(view) {
 const main = document.querySelector('.private-main');
 if (!main?.querySelector('#inscricoes') && restoreDashboard) await restoreDashboard();
 decorateEditionWorkspace(main);
 decorateFairEditions(main);
 buildDashboardOverview(main);
 applyDashboardView(view);
}

function installDashboardViewNavigation() {
 const sidebar = document.querySelector('.private-sidebar');
 const main = document.querySelector('.private-main');
 if (sidebar && sidebar.dataset.dashboardViews !== 'ready') {
  sidebar.dataset.dashboardViews = 'ready';
  sidebar.addEventListener('click', event => {
   const link = event.target.closest('[data-dashboard-view]');
   if (!link) return;
   event.preventDefault();
   openDashboardView(link.dataset.dashboardView);
  });
 }
 if (main && main.dataset.dashboardViews !== 'ready') {
  main.dataset.dashboardViews = 'ready';
  main.addEventListener('click', event => {
   const viewButton = event.target.closest('[data-dashboard-view]');
   if (viewButton) { event.preventDefault(); openDashboardView(viewButton.dataset.dashboardView); return; }
   const editionButton = event.target.closest('[data-open-edition]');
   if (!editionButton) return;
   const select = main.querySelector('[data-edition]');
   if (!select) return;
   currentDashboardView = 'applications';
   select.value = editionButton.dataset.openEdition;
   select.dispatchEvent(new Event('change', { bubbles: true }));
  });
 }
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
 decorateEditionWorkspace(main);
 decorateFairEditions(main);
 buildDashboardOverview(main);
 if (!document.querySelector('[data-dashboard-view]')) installScrollSpy(main);
 installSectionNavigation();
 installDashboardViewNavigation();
 installAdminViewNavigation();
 installMobileNavigation();
 installBackToTop();
 if (!contentObserver) {
  contentObserver = new MutationObserver(() => {
   if (!main.querySelector('.panel:not(.dashboard-panel)')) return;
   decoratePanels(main);
   decorateEditionWorkspace(main);
   decorateFairEditions(main);
   buildDashboardOverview(main);
   if (document.querySelector('[data-dashboard-view]')) applyDashboardView(currentDashboardView,{scroll:false});
   else installScrollSpy(main);
  });
  contentObserver.observe(main, { childList: true, subtree: true });
 }
 if (document.querySelector('[data-dashboard-view]')) applyDashboardView(currentDashboardView,{scroll:false});
}
