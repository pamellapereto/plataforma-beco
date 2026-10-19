const toast = document.querySelector('#toast');

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2600);
}

window.becoShowToast = showToast;

function setupCurationForm() {
  const form = document.querySelector('[data-curation-form]');
  if (!form) return;
  const category = document.querySelector('#curationCategory');
  const authorial = new Set(['ARTES_VISUAIS', 'ARTESANATO', 'COSMETICOS', 'LIVROS_AUTORAIS', 'MODA_AUTORAL']);
  const collectibles = new Set(['SEBO', 'BRECHO']);
  const branches = { authorial: document.querySelector('[data-form-branch="authorial"]'), collectibles: document.querySelector('[data-form-branch="collectibles"]') };

  function setBranch(branch, active) {
    if (!branch) return;
    branch.classList.toggle('is-hidden', !active);
    branch.querySelectorAll('input, select, textarea').forEach(field => { field.disabled = !active; });
  }

  function updateCategoryBranch() {
    const value = category.value;
    setBranch(branches.authorial, authorial.has(value));
    setBranch(branches.collectibles, collectibles.has(value));
  }

  category.addEventListener('change', updateCategoryBranch);
  updateCategoryBranch();

  const files = document.querySelector('[data-portfolio-files]');
  const summary = document.querySelector('[data-file-summary]');
  files?.addEventListener('change', () => { summary.textContent = files.files.length ? `${files.files.length} arquivo(s) selecionado(s) para análise.` : 'Nenhum arquivo selecionado.'; });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.collectionItems = new FormData(form).getAll('collectionItems');
      for (const key of ['authorialConfirmation','prohibitedItemsConfirmation','groupConfirmation','noResale','feePolicy','terms','publicPortfolio']) payload[key] = new FormData(form).has(key);
      if (payload.email.trim().toLowerCase() !== String(payload.emailConfirmation || '').trim().toLowerCase()) throw new Error('Os e-mails informados não coincidem.');
      payload.editionId = new URLSearchParams(location.search).get('edicao');
      if (!payload.editionId) throw new Error('Não foi possível identificar a edição. Acesse o formulário pelo botão de inscrição da feira.');
      const selected = [...(form.querySelector('[data-portfolio-files]')?.files || [])];
      if (selected.length > 4) throw new Error('Envie no máximo 4 imagens.');
      payload.files = await Promise.all(selected.map(file => new Promise((resolve,reject) => {
        if (file.size > 750 * 1024) return reject(new Error('Cada imagem deve ter até 750 KB para envio seguro.'));
        const reader = new FileReader(); reader.onload = () => resolve({name:file.name,type:file.type,data:String(reader.result).split(',')[1]}); reader.onerror = () => reject(new Error('Não foi possível ler uma das imagens.')); reader.readAsDataURL(file);
      })));
      const response = await fetch('/api/v1/applications', {method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});
      const result = await response.json().catch(()=>null);
      if (!response.ok) throw new Error(result?.error?.message || 'Não foi possível enviar sua inscrição.');
      form.reset(); updateCategoryBranch();
      showToast('Inscrição enviada para análise da curadoria.');
      form.scrollIntoView({behavior:'smooth',block:'start'});
    } catch (problem) { showToast(problem.message || 'Não foi possível enviar sua inscrição.'); }
    finally { submit.disabled = false; }
  });
}

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

function setupPrototypeActions() {
  document.querySelectorAll('[data-toast]').forEach(element => element.addEventListener('click', () => showToast(element.dataset.toast)));
  document.querySelectorAll('form:not([data-login-form]):not([data-curation-form])').forEach(form => form.addEventListener('submit', event => { event.preventDefault(); showToast(form.dataset.message || 'Informações salvas no protótipo.'); }));
  document.querySelectorAll('[data-visibility-toggle]').forEach(control => control.addEventListener('change', async () => {
    try {
      const { api } = await import('./assets/js/models/api.model.js');
      await api.updateVisibility(control.checked);
      showToast(control.checked ? 'Perfil público ativado.' : 'Perfil restrito à curadoria.');
    } catch (problem) { control.checked = !control.checked; showToast(problem.message || 'Não foi possível atualizar a visibilidade.'); }
  }));
  document.querySelectorAll('[data-review-action]').forEach(button => button.addEventListener('click', () => {
    const status = button.closest('tr')?.querySelector('.status');
    if (!status) return;
    const approved = button.dataset.reviewAction === 'approve';
    status.className = `status ${approved ? 'approved' : 'rejected'}`;
    status.textContent = approved ? 'Aprovada' : 'Solicitar ajuste';
    showToast(approved ? 'Foto aprovada.' : 'Mensagem de ajuste preparada.');
  }));
}

setupCurationForm();
setupDirectoryFilter();
setupPrototypeActions();

import('./assets/js/app.js').catch(error => {
  console.error('Falha ao iniciar a integracao com a API.', error);
  showToast('Nao foi possivel carregar os dados atualizados.');
});
