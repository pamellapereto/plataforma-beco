import { config } from '../../config.js';
import { HttpError } from '../../lib/http.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value, field, { min = 1, max = 255 } = {}) {
  const normalized = String(value || '').trim();
  if (normalized.length < min || normalized.length > max) {
    throw new HttpError(422, 'INVALID_INPUT', `${field} deve ter entre ${min} e ${max} caracteres.`);
  }
  return normalized;
}

function httpUrl(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim();
  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol) || normalized.length > 500) throw new Error('invalid');
    return url.toString();
  } catch {
    throw new HttpError(422, 'INVALID_URL', `${field} deve ser uma URL HTTP ou HTTPS válida.`);
  }
}

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!emailPattern.test(email) || email.length > 255) throw new HttpError(422, 'INVALID_EMAIL', 'Informe um e-mail válido.');
  return email;
}

export function validatePassword(value) {
  const password = String(value || '');
  if (password.length < config.auth.minPasswordLength || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(422, 'WEAK_PASSWORD', `A senha deve ter ao menos ${config.auth.minPasswordLength} caracteres, uma letra e um número.`);
  }
  return password;
}

export function validateLogin(input) {
  return { email: normalizeEmail(input.email), password: text(input.password, 'Senha', { min: 1, max: 200 }) };
}

export function validateRefresh(input) {
  return { refreshToken: text(input.refreshToken, 'Token de renovação', { min: 1, max: 4096 }) };
}

export function validateRecovery(input) {
  return { email: normalizeEmail(input.email) };
}

export function validatePasswordUpdate(input) {
  return { password: validatePassword(input.password) };
}

export function validateExhibitorRegistration(input) {
  if (input.acceptedTerms !== true) throw new HttpError(422, 'TERMS_REQUIRED', 'É necessário aceitar os termos de uso e responsabilidade.');
  const phone = text(input.phone, 'Telefone', { min: 8, max: 30 });
  if (phone.replace(/\D/g, '').length < 8) throw new HttpError(422, 'INVALID_PHONE', 'Informe um telefone válido.');
  const state = input.state ? text(input.state, 'Estado', { min: 2, max: 2 }).toUpperCase() : null;
  const profileVisibility = input.profileVisibility || 'PRIVATE';
  if (!['PUBLIC', 'PRIVATE'].includes(profileVisibility)) throw new HttpError(422, 'INVALID_VISIBILITY', 'Visibilidade de perfil inválida.');
  return {
    email: normalizeEmail(input.email),
    password: validatePassword(input.password),
    fullName: text(input.fullName, 'Nome completo', { min: 3, max: 180 }),
    displayName: text(input.displayName, 'Nome do expositor', { min: 2, max: 180 }),
    phone,
    instagramUrl: httpUrl(input.instagramUrl, 'Instagram'),
    city: input.city ? text(input.city, 'Cidade', { max: 120 }) : null,
    state,
    profileVisibility
  };
}

export function validateAdminAccount(input) {
  return {
    email: normalizeEmail(input.email),
    password: validatePassword(input.password),
    fullName: text(input.fullName, 'Nome completo', { min: 3, max: 180 })
  };
}

export function validateExhibitorStatus(input) {
  const status = String(input.status || '').toUpperCase();
  if (!['PENDING', 'APPROVED', 'SUSPENDED'].includes(status)) throw new HttpError(422, 'INVALID_STATUS', 'Status de expositor inválido.');
  return status;
}

export function validateAccountStatus(input) {
  if (typeof input.isActive !== 'boolean') throw new HttpError(422, 'INVALID_STATUS', 'Informe se a conta está ativa.');
  return input.isActive;
}
