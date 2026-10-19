import { api } from '../models/api.model.js';
import { error, loading, renderCategoryOptions, renderExhibitorDetail, renderExhibitors, renderFairDetail, renderFairs, renderMetrics } from '../views/catalog.view.js';

function setupDirectoryFilter() {
  const category = document.querySelector('#directoryFilter');
  const search = document.querySelector('#directorySearch');
  const filter = () => {
    const selected = category?.value || '';
    const term = (search?.value || '').trim().toLocaleLowerCase('pt-BR');
    document.querySelectorAll('[data-exhibitor-card]').forEach(card => {
      const visible = (!selected || card.dataset.category === selected) && (!term || card.textContent.toLocaleLowerCase('pt-BR').includes(term));
      card.classList.toggle('is-hidden', !visible);
    });
  };
  category?.addEventListener('change', filter);
  search?.addEventListener('input', filter);
}

export async function initializeCatalog(page) {
  if (page === 'home') {
    const metrics = document.querySelector('[data-home-metrics], .metric-grid');
    const fairsContainer = document.querySelector('[data-home-fairs], main .fair-grid');
    const exhibitorsContainer = document.querySelector('[data-home-exhibitors], main .exhibitor-grid');
    [metrics, fairsContainer, exhibitorsContainer].forEach(item => loading(item));
    try {
      const [fairs, exhibitors] = await Promise.all([api.fairs(), api.exhibitors()]);
      renderMetrics(metrics, fairs, exhibitors);
      renderFairs(fairsContainer, fairs, 3);
      renderExhibitors(exhibitorsContainer, exhibitors, 3);
    } catch (problem) {
      [metrics, fairsContainer, exhibitorsContainer].forEach(item => error(item, problem.message));
    }
  }

  if (page === 'fairs') {
    const container = document.querySelector('[data-fairs-list], main .fair-grid');
    loading(container);
    try { renderFairs(container, await api.fairs()); } catch (problem) { error(container, problem.message); }
  }

  if (page === 'exhibitors') {
    const container = document.querySelector('[data-exhibitors-list], main .exhibitor-grid');
    const select = document.querySelector('#directoryFilter');
    loading(container);
    try {
      const [exhibitors, categories] = await Promise.all([api.exhibitors(), api.exhibitorCategories()]);
      renderExhibitors(container, exhibitors);
      renderCategoryOptions(select, categories);
      setupDirectoryFilter();
    } catch (problem) { error(container, problem.message); }
  }

  if (page === 'fair-detail') {
    const main = document.querySelector('main');
    const slug = new URLSearchParams(location.search).get('edicao') || document.body.dataset.editionSlug || '37-feira-beco-do-inferno';
    loading(main, 'Carregando a feira...');
    try { renderFairDetail(main, await api.fair(slug)); } catch (problem) { error(main, problem.message); }
  }

  if (page === 'exhibitor-detail') {
    const main = document.querySelector('main');
    loading(main, 'Carregando o portfolio...');
    try {
      let id = new URLSearchParams(location.search).get('id');
      if (!id) id = (await api.exhibitors())[0]?.id;
      if (!id) throw new Error('Expositor nao encontrado.');
      renderExhibitorDetail(main, await api.exhibitor(id));
    } catch (problem) { error(main, problem.message); }
  }
}
