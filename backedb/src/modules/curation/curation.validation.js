import { HttpError } from '../../lib/http.js';

const decisions = new Set(['PHOTO_REVIEW', 'UNDER_REVIEW', 'AWAITING_UPDATE', 'WAITLISTED', 'APPROVED', 'CONFIRMED', 'DECLINED', 'CANCELLED']);
const mediaStatuses = new Set(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']);
const exceptionStatuses = new Set(['APPROVED', 'DECLINED']);

function note(value, required = false) {
  const result = String(value || '').trim();
  if ((required && result.length < 5) || result.length > 3000) throw new HttpError(422, 'INVALID_NOTE', 'Informe uma orientação de 5 a 3000 caracteres.');
  return result || null;
}

export function validateDecision(input = {}) {
  const status = String(input.status || '').toUpperCase();
  if (!decisions.has(status)) throw new HttpError(422, 'INVALID_STATUS', 'Decisão de curadoria inválida.');
  return { status, note: note(input.note, ['AWAITING_UPDATE', 'DECLINED'].includes(status)), visible: input.visibleToExhibitor !== false };
}

export function validateMediaReview(input = {}) {
  const status = String(input.status || '').toUpperCase();
  if (!mediaStatuses.has(status)) throw new HttpError(422, 'INVALID_MEDIA_STATUS', 'Decisão sobre a imagem inválida.');
  return { status, note: note(input.note, status !== 'APPROVED') };
}

export function validateExceptionDecision(input = {}) {
  const status = String(input.status || '').toUpperCase();
  if (!exceptionStatuses.has(status)) throw new HttpError(422, 'INVALID_EXCEPTION_STATUS', 'Decisão sobre o pedido inválida.');
  return { status, note: note(input.note) };
}
