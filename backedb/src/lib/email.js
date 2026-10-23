import { config } from '../config.js';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export class EmailService {
  constructor(settings = config.email, fetcher = fetch) {
    this.settings = settings;
    this.fetcher = fetcher;
  }

  get configured() {
    return Boolean(this.settings.resendApiKey && this.settings.from);
  }

  async send({ to, subject, title, message }) {
    if (!this.configured || !to) return { sent: false, reason: 'not_configured' };
    const response = await this.fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.settings.resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: this.settings.from,
        to: [to],
        reply_to: this.settings.replyTo || undefined,
        subject,
        html: `<main style="font-family:Arial,sans-serif;color:#252525;line-height:1.6"><h1 style="font-size:22px">${escapeHtml(title)}</h1><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p>Equipe BECO memória viva</p></main>`
      })
    });
    if (!response.ok) return { sent: false, reason: 'provider_error' };
    return { sent: true, data: await response.json().catch(() => null) };
  }
}
