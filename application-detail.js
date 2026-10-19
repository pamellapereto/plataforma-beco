(() => {
  const modal = document.querySelector('[data-application-modal]');
  if (!modal) return;

  const applications = {
    madeira: {
      exhibitor: 'Arte em Madeira', fair: '37ª Feira Beco do Inferno', submitted: '18 de setembro de 2026', status: 'Fotos em revisão',
      stages: ['Formulário enviado', 'Fotos em revisão', 'Curadoria', 'Espaço confirmado'], current: 1,
      photos: [
        ['assets/expositor-madeira-human.jpg', 'Peças em madeira', 'Aprovada'],
        ['assets/expositor-madeira.jpg', 'Objetos autorais', 'Em revisão'],
        ['assets/expositor-ceramica-human.jpg', 'Composição de produtos', 'Aprovada']
      ],
      groups: [
        ['Identificação', [['Nome', 'Mariana Souza'], ['WhatsApp', '(15) 99999-9999'], ['E-mail', 'mariana@arteemmadeira.com'], ['Instagram profissional', '@arteemmadeira']]],
        ['Categoria e proposta', [['Categoria', 'Artesanato'], ['O que levará', 'Peças autorais em madeira reaproveitada: objetos de casa, memória e afeto.'], ['Confirmação de produtos', 'Confirmado: apenas os produtos descritos.']]],
        ['Participação e estrutura', [['Por que participar', 'Quero apresentar meu trabalho autoral e fortalecer a rede local de artesãos.'], ['Histórico', 'Já participou de 6 edições.'], ['Estrutura', 'Tenda 2x2'], ['Taxa', 'Pode contribuir após a seleção.']]],
        ['Portfólio e termos', [['Portfólio', '4 fotos enviadas - 1 em revisão.'], ['Acessibilidade', 'Sem necessidade informada.'], ['Perfil público', 'Autorizado após aprovação.'], ['Termos', 'Todos os aceites confirmados.']]]
      ]
    },
    trama: {
      exhibitor: 'Trama Livre', fair: 'OCA Feira Cultural', submitted: '20 de setembro de 2026', status: 'Aguardando vaga',
      stages: ['Formulário enviado', 'Fotos aprovadas', 'Curadoria', 'Espaço confirmado'], current: 2,
      photos: [
        ['assets/expositor-trama-human.jpg', 'Coleção têxtil', 'Aprovada'],
        ['assets/expositor-trama.jpg', 'Detalhe de tecido', 'Aprovada'],
        ['assets/expositor-luz-human.jpg', 'Composição de produtos', 'Aprovada']
      ],
      groups: [
        ['Identificação', [['Nome', 'Luisa Nogueira'], ['WhatsApp', '(15) 98888-1111'], ['E-mail', 'luisa@tramalivre.com'], ['Instagram profissional', '@trama.livre']]],
        ['Categoria e proposta', [['Categoria', 'Moda autoral'], ['O que levará', 'Peças têxteis em pequena escala, costuradas manualmente.'], ['Confirmação de produtos', 'Confirmado: apenas os produtos descritos.']]],
        ['Participação e estrutura', [['Por que participar', 'Será minha primeira edição e quero apresentar a marca ao público local.'], ['Histórico', 'Primeira inscrição.'], ['Estrutura', 'Tenda 2x2'], ['Taxa', 'Pedido de isenção enviado para análise.']]],
        ['Portfólio e termos', [['Portfólio', '5 fotos aprovadas.'], ['Acessibilidade', 'Prefere não responder.'], ['Perfil público', 'Não autorizado.'], ['Termos', 'Todos os aceites confirmados.']]]
      ]
    },
    luz: {
      exhibitor: 'Luz do Design', fair: '37ª Feira Beco do Inferno', submitted: '21 de setembro de 2026', status: 'Formulário completo',
      stages: ['Formulário enviado', 'Fotos em revisão', 'Curadoria', 'Espaço confirmado'], current: 1,
      photos: [
        ['assets/expositor-luz-human.jpg', 'Luminárias autorais', 'Em revisão'],
        ['assets/expositor-luz.jpg', 'Objeto de design', 'Aprovada'],
        ['assets/evento-arte-human.jpg', 'Composição de portfólio', 'Em revisão']
      ],
      groups: [
        ['Identificação', [['Nome', 'Rafael Luz'], ['WhatsApp', '(15) 97777-1234'], ['E-mail', 'rafael@luzdodesign.com'], ['Instagram profissional', '@luzdodesign']]],
        ['Categoria e proposta', [['Categoria', 'Artes visuais'], ['O que levará', 'Luminárias e objetos de design autoral.'], ['Confirmação de produtos', 'Confirmado: apenas os produtos descritos.']]],
        ['Participação e estrutura', [['Por que participar', 'Quero conectar o design independente à programação cultural da cidade.'], ['Histórico', 'Participou de 2 edições.'], ['Estrutura', 'Tenda 3x3'], ['Taxa', 'Pode contribuir após a seleção.']]],
        ['Portfólio e termos', [['Portfólio', '3 fotos enviadas - aguardando revisão.'], ['Acessibilidade', 'Sem necessidade informada.'], ['Perfil público', 'Autorizado após aprovação.'], ['Termos', 'Todos os aceites confirmados.']]]
      ]
    }
  };

  applications.tramaBeco = { ...applications.trama, fair: '37ª Feira Beco do Inferno', status: 'Em análise' };

  const escape = value => String(value).replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
  const close = () => { modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; };
  const open = application => {
    if (!application) return;
    modal.querySelector('#application-modal-title').textContent = `Formulário de ${application.exhibitor}`;
    modal.querySelector('[data-application-summary]').textContent = `${application.fair} · enviada em ${application.submitted}`;
    const progress = application.stages.map((stage, index) => `<div class="application-step ${index < application.current ? 'complete' : ''} ${index === application.current ? 'current' : ''}">${escape(stage)}</div>`).join('');
    const groups = application.groups.map(([title, answers]) => `<section class="application-modal-section"><h3>${escape(title)}</h3><div class="answer-grid">${answers.map(([label, value]) => `<article class="answer-item ${String(value).length > 85 ? 'full' : ''}"><span>${escape(label)}</span><b class="${String(value).startsWith('Sem') || String(value).startsWith('Prefere') ? 'muted' : ''}">${escape(value)}</b></article>`).join('')}</div></section>`).join('');
    const photos = application.photos.map(([source, label, state]) => `<article class="application-photo-card"><img src="${escape(source)}" alt="${escape(label)}"><div><span>${escape(label)}</span><b class="status ${state === 'Aprovada' ? 'approved' : 'review'}">${escape(state)}</b></div></article>`).join('');
    const photoSection = `<section class="application-modal-section"><div class="photo-section-heading"><h3>Fotos dos produtos</h3><p>Imagens enviadas com esta inscrição.</p></div><div class="application-photo-grid">${photos}</div></section>`;
    modal.querySelector('[data-application-content]').innerHTML = `<section class="application-modal-section"><div class="registration-state">${escape(application.status)}</div><div class="application-progress">${progress}</div></section>${groups}${photoSection}`;
    modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
  };

  document.querySelectorAll('[data-view-application]').forEach(button => button.addEventListener('click', () => open(applications[button.dataset.viewApplication])));
  modal.querySelectorAll('[data-close-application-modal]').forEach(button => button.addEventListener('click', close));
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('is-open')) close(); });
})();
