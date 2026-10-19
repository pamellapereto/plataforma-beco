import { api } from '../models/api.model.js';

const destinations = { BECO_ADMIN: 'curadoria.html', EXHIBITOR: 'area-expositor.html' };

function feedback(message, success = false) {
  const element = document.querySelector('[data-login-feedback]');
  if (!element) return;
  element.textContent = message;
  element.className = `login-feedback${success ? ' success' : ''}`;
}

function updateNavigation(session) {
  const link = document.querySelector('.header-actions a[href="login.html"]');
  if (!link || !session?.account) return;
  link.textContent = session.account.role === 'BECO_ADMIN' ? 'Area da curadoria' : 'Minha area';
  link.href = destinations[session.account.role] || 'login.html';
}

function addLogout(session) {
  const sidebar = document.querySelector('.private-sidebar');
  if (!sidebar || !session || sidebar.querySelector('[data-logout]')) return;
  const button = document.createElement('button');
  button.className = 'private-logout';
  button.type = 'button';
  button.dataset.logout = '';
  button.textContent = 'Sair';
  button.addEventListener('click', async () => { await api.logout(); window.location.href = 'index.html'; });
  sidebar.append(button);
}

export async function initializeAuth(page) {
  const session = api.session();
  updateNavigation(session);
  const requiredRole = page === 'curation-dashboard' ? 'BECO_ADMIN' : page === 'exhibitor-dashboard' ? 'EXHIBITOR' : null;
  if (requiredRole && session?.account?.role !== requiredRole) {
    window.location.replace(`login.html?next=${encodeURIComponent(location.pathname.split('/').pop())}`);
    return false;
  }
  addLogout(session);
  if (page !== 'login') return true;

  const form = document.querySelector('[data-login-form]');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.checkValidity()) return form.reportValidity();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    feedback('Validando acesso...');
    try {
      const payload = await api.login(document.querySelector('#loginEmail').value.trim(), document.querySelector('#loginPassword').value);
      const saved = api.saveSession(payload);
      feedback('Acesso confirmado. Redirecionando...', true);
      window.location.href = destinations[saved.account.role] || 'index.html';
    } catch (problem) {
      feedback(problem.message || 'E-mail ou senha nao conferem.');
      button.disabled = false;
    }
  });
  return true;
}
