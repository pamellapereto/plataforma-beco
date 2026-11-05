let observer;
let contentObserver;

function setActiveLink(id) {
 document.querySelectorAll('.private-sidebar a[href^="#"]').forEach(link => {
  const active = link.getAttribute('href') === `#${id}`;
  link.classList.toggle('active', active);
  if (active) link.setAttribute('aria-current', 'location');
  else link.removeAttribute('aria-current');
 });
}

function decoratePanels(main) {
 main.querySelectorAll(':scope > .panel').forEach((panel, index) => {
  panel.classList.add('dashboard-panel');
  panel.style.setProperty('--panel-order', index);
  const heading = panel.querySelector(':scope > h2, :scope > .workflow-section-heading h2, :scope > .panel-title h2');
  if (heading && !heading.querySelector('.panel-anchor')) {
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
  const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visible) setActiveLink(visible.target.id);
 }, { rootMargin: '-18% 0px -68% 0px', threshold: [0, .2, .6] });
 sections.forEach(section => observer.observe(section));
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

export function enhanceDashboard() {
 const main = document.querySelector('.private-main');
 if (!main) return;
 decoratePanels(main);
 installScrollSpy(main);
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
