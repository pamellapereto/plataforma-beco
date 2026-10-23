const toast = document.querySelector('#toast');
window.becoShowToast = message => {
  if (!toast) return;
  toast.textContent = message; toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 4000);
};
import('./assets/js/app.js').catch(error => {
  console.error('Não foi possível iniciar a plataforma.', error);
  window.becoShowToast('Não foi possível carregar a página. Atualize e tente novamente.');
});
