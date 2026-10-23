import { api } from '../models/api.model.js';
import { bindForm, notice, safeNext } from '../ui.js';

export async function initializeAuth(page) {
  const feedback = document.querySelector('[data-feedback], [data-login-feedback]');
  const hash = new URLSearchParams(location.hash.slice(1));
  let recoveryToken = null;
  if (hash.has('access_token') || hash.has('error_description')) {
    history.replaceState(null, '', location.pathname + location.search);
    if (hash.has('error_description')) notice(feedback, 'O link expirou ou é inválido. Solicite um novo e-mail de recuperação.');
    else if (page === 'password-reset') recoveryToken = hash.get('access_token');
    else {
      try {
        const profile = await api.request('/auth/me', { headers: { Authorization: `Bearer ${hash.get('access_token')}` }, auth: false });
        api.saveSession({ ...profile, session: { accessToken: hash.get('access_token'), refreshToken: hash.get('refresh_token'), expiresAt: Number(hash.get('expires_at')) } });
        location.replace(safeNext(profile.account.role)); return false;
      } catch (error) { notice(feedback, error.message); }
    }
  }
  const registerLink=document.querySelector('[data-register-link]');
  if(registerLink)registerLink.href=`cadastro-expositor.html${location.search}`;
  const requiredRole = page === 'curation-dashboard' ? 'BECO_ADMIN' : ['exhibitor-dashboard','application'].includes(page) ? 'EXHIBITOR' : null;
  let session = api.session();
  if (requiredRole) {
    if (!session) { location.replace(`login.html?next=${encodeURIComponent(location.pathname + location.search)}`); return false; }
    try {
      const profile = await api.me();
      session = api.saveSession({ ...profile, session: api.session() });
      if (profile.account.role !== requiredRole) { location.replace(safeNext(profile.account.role)); return false; }
    } catch (error) {
      if ([401,403].includes(error.status)) { api.clearSession();location.replace(`login.html?next=${encodeURIComponent(location.pathname + location.search)}`); }
      else { const main=document.querySelector('main'); main.textContent='Não foi possível verificar o acesso. Atualize para tentar novamente.'; }
      return false;
    }
  }
  const link = document.querySelector('.header-actions a[href="login.html"]');
  if (link && session?.account) { link.textContent = 'Minha área'; link.href = session.account.role === 'BECO_ADMIN' ? 'curadoria.html' : 'area-expositor.html'; }
  const sidebar = document.querySelector('.private-sidebar');
  if (sidebar && session) {
    const button=document.createElement('button');button.className='private-logout';button.textContent='Sair';button.type='button';
    button.onclick=async()=>{button.disabled=true;try{await api.logout();}catch{/* clearSession runs even offline */}location.href='index.html';};sidebar.append(button);
  }
  bindForm(document.querySelector('[data-login-form]'), async data => {
    const payload = await api.login(data.email, data.password); api.saveSession(payload); location.href=safeNext(payload.account.role);
  });
  bindForm(document.querySelector('[data-register-form]'), async (data, form) => {
    if (data.password !== data.passwordConfirmation) throw Error('As senhas devem ser iguais.');
    if (data.email.toLowerCase() !== data.emailConfirmation.toLowerCase()) throw Error('Os e-mails devem ser iguais.');
    const payload=await api.request('/auth/register/exhibitor',{method:'POST',auth:false,body:{...data,acceptedTerms:!!data.acceptedTerms,profileVisibility:'PRIVATE'}});
    if (payload.session) {api.saveSession(payload);location.href=safeNext('EXHIBITOR');}
    else { form.reset(); notice(form.querySelector('[data-feedback]'),'Cadastro criado. Confirme seu e-mail para entrar. Confira também a pasta de spam.',true); }
  });
  bindForm(document.querySelector('[data-recovery-form]'), async (_data,form) => {
    await api.request('/auth/password/recover',{method:'POST',auth:false,body:{email:form.elements.email.value}});
    notice(form.querySelector('[data-feedback]'),'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.',true);
  });
  bindForm(document.querySelector('[data-reset-form]'), async (data,form) => {
    if (!recoveryToken) throw Error('Abra esta página pelo link recebido por e-mail. Se ele expirou, solicite outro.');
    if (data.password !== data.passwordConfirmation) throw Error('As senhas devem ser iguais.');
    await api.request('/auth/password/update',{method:'POST',auth:false,headers:{Authorization:`Bearer ${recoveryToken}`},body:{password:data.password}});
    recoveryToken=null; api.clearSession();form.reset();notice(form.querySelector('[data-feedback]'),'Senha atualizada. Entre com sua nova senha.',true);
    form.querySelector('[type=submit]').remove();
  });
  return true;
}
