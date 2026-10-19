(() => {
  const modal = document.querySelector('[data-fair-modal]');
  if (!modal) return;

  const openModal = () => {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    modal.querySelector('input')?.focus();
  };
  const closeModal = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  document.querySelectorAll('[data-open-fair-modal]').forEach(button => button.addEventListener('click', openModal));
  modal.querySelectorAll('[data-close-fair-modal]').forEach(button => button.addEventListener('click', closeModal));
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });

  modal.querySelector('form')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = modal.querySelector('[data-modal-feedback]');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    feedback.textContent = 'Rascunho da feira salvo. A edição pode ser publicada quando a curadoria concluir a revisão.';
    feedback.classList.add('success');
  });
})();
