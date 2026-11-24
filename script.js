const toast = document.querySelector('#toast');
window.becoShowToast = message => {
  if (!toast) return;
  toast.textContent = message; toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 4000);
};
document.documentElement.classList.add('app-loading');
const loadingStyle = document.createElement('style');
loadingStyle.textContent = 'html.app-loading body>main,html.app-loading body>footer{visibility:hidden}';
document.head.append(loadingStyle);

import('./assets/js/app.js')
  .catch(error => {
    console.error('Não foi possível iniciar a plataforma.', error);
    if (window.becoShowToast) window.becoShowToast('Não foi possível carregar a página. Atualize e tente novamente.');
  })
  .finally(() => {
    document.documentElement.classList.remove('app-loading');
    document.documentElement.classList.add('app-ready');
    loadingStyle.remove();
  });
