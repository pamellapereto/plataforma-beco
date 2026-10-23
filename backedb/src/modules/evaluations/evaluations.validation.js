import { HttpError } from '../../lib/http.js';

const ratingKeys = [
  'organizationCommunicationRating',
  'structureRating',
  'publicityRating',
  'audienceRating',
  'overallRating'
];

function rating(value, label, optional = false) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new HttpError(422, 'INVALID_RATING', `${label} deve ser uma nota inteira de 1 a 5.`);
  }
  return value;
}

export function validateAttendance(input) {
  if (typeof input.attended !== 'boolean') throw new HttpError(422, 'INVALID_ATTENDANCE', 'Informe se o expositor compareceu.');
  const note = String(input.note || '').trim();
  if (note.length > 1000) throw new HttpError(422, 'INVALID_ATTENDANCE_NOTE', 'A observação deve ter até 1.000 caracteres.');
  return { attended: input.attended, note: note || null };
}

export function validateEvaluation(input) {
  const labels = {
    organizationCommunicationRating: 'Organização e comunicação',
    structureRating: 'Estrutura',
    publicityRating: 'Divulgação',
    audienceRating: 'Público e visitação',
    overallRating: 'Experiência geral'
  };
  const values = Object.fromEntries(ratingKeys.map((key) => [key, rating(input[key], labels[key])]));
  values.salesRating = rating(input.salesRating, 'Vendas', true);
  const comments = String(input.comments || '').trim();
  if (comments.length > 3000) throw new HttpError(422, 'INVALID_EVALUATION_COMMENTS', 'O comentário deve ter até 3.000 caracteres.');
  return { ...values, comments: comments || null };
}
