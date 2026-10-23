import { HttpError } from '../../lib/http.js';
import { validateUuid } from '../fairs/fairs.validation.js';

export function validateDraft(input = {}) {
  const requestedSpaceType = input.requestedSpaceType === undefined || input.requestedSpaceType === null
    ? null
    : String(input.requestedSpaceType).trim();
  if (requestedSpaceType && requestedSpaceType.length > 40) throw new HttpError(422, 'INVALID_SPACE_TYPE', 'Tipo de espaço inválido.');
  return { requestedSpaceType };
}

export function validateAnswers(input = {}) {
  if (!Array.isArray(input.answers) || input.answers.length > 120) throw new HttpError(422, 'INVALID_ANSWERS', 'Envie uma lista válida de respostas.');
  const ids = new Set();
  return input.answers.map((answer) => {
    const fieldId = validateUuid(answer?.fieldId, 'Pergunta');
    if (ids.has(fieldId)) throw new HttpError(422, 'DUPLICATE_ANSWER', 'Uma pergunta foi respondida mais de uma vez.');
    if (answer?.value === null || answer?.value === undefined) {
      throw new HttpError(422, 'INVALID_ANSWER_VALUE', 'A resposta de uma pergunta não pode ser nula.');
    }
    ids.add(fieldId);
    return { fieldId, value: answer.value };
  });
}

export function validateConsents(input = {}) {
  if (!Array.isArray(input.consents) || input.consents.length > 20) {
    throw new HttpError(422, 'CONSENTS_REQUIRED', 'Envie uma lista válida de termos aceitos.');
  }
  const keys = new Set();
  return input.consents.map((consent) => {
    const key = String(consent.key || '').trim();
    if (!/^[a-z][a-z0-9_-]{1,99}$/i.test(key) || keys.has(key) || consent.accepted !== true) {
      throw new HttpError(422, 'CONSENTS_REQUIRED', 'Todos os termos obrigatórios devem ser aceitos.');
    }
    keys.add(key);
    return key;
  });
}

export function validateExceptionRequest(input = {}) {
  const reason = String(input.reason || '').trim();
  if (reason.length < 10 || reason.length > 3000) throw new HttpError(422, 'INVALID_REASON', 'A justificativa deve ter entre 10 e 3000 caracteres.');
  return { reason, requestType: String(input.requestType || 'EXEMPTION').trim().slice(0, 80) || 'EXEMPTION' };
}
