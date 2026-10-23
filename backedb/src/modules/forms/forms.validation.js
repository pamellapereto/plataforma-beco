import { HttpError } from '../../lib/http.js';

const fieldTypes = new Set(['SHORT_TEXT', 'LONG_TEXT', 'EMAIL', 'PHONE', 'URL', 'SELECT', 'MULTISELECT', 'RADIO', 'CHECKBOX', 'DATE', 'FILE', 'IMAGE']);
const optionTypes = new Set(['SELECT', 'MULTISELECT', 'RADIO']);
const keyPattern = /^[a-z][a-z0-9_]{1,99}$/;

function text(value, label, max) {
  const result = String(value || '').trim();
  if (!result || result.length > max) throw new HttpError(422, 'INVALID_FORM', `${label} é obrigatório e deve ter até ${max} caracteres.`);
  return result;
}

function optionalText(value, max) {
  if (value === undefined || value === null || value === '') return null;
  const result = String(value).trim();
  if (result.length > max) throw new HttpError(422, 'INVALID_FORM', `Um texto do formulário ultrapassa ${max} caracteres.`);
  return result;
}

function plainObject(value, label) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(422, 'INVALID_FORM', `${label} deve ser um objeto.`);
  return value;
}

export function validateFormDefinition(input = {}) {
  if (!Array.isArray(input.sections) || !input.sections.length || input.sections.length > 20) {
    throw new HttpError(422, 'INVALID_FORM', 'O formulário deve possuir entre 1 e 20 seções.');
  }
  const keys = new Set();
  const consentKeys = new Set();
  const sourceConsents = input.consents === undefined ? [] : input.consents;
  if (!Array.isArray(sourceConsents) || sourceConsents.length > 20 || (input.isPublished === true && !sourceConsents.length)) {
    throw new HttpError(422, 'INVALID_FORM_CONSENTS', 'Um formulário publicado deve possuir entre 1 e 20 termos.');
  }
  const consents = sourceConsents.map((consent) => {
    const key = String(consent.key || '').trim();
    if (!keyPattern.test(key) || consentKeys.has(key)) throw new HttpError(422, 'INVALID_FORM_CONSENTS', 'A chave de um termo é inválida ou repetida.');
    consentKeys.add(key);
    return { key, text: text(consent.text, 'Texto do termo', 5000) };
  });
  let fieldCount = 0;
  const sections = input.sections.map((section, sectionIndex) => {
    if (!Array.isArray(section.fields) || !section.fields.length) throw new HttpError(422, 'INVALID_FORM', `A seção ${sectionIndex + 1} precisa de perguntas.`);
    const fields = section.fields.map((field) => {
      fieldCount += 1;
      if (fieldCount > 120) throw new HttpError(422, 'INVALID_FORM', 'O formulário pode ter no máximo 120 perguntas.');
      const fieldKey = String(field.fieldKey || '').trim();
      if (!keyPattern.test(fieldKey) || keys.has(fieldKey)) throw new HttpError(422, 'INVALID_FORM_KEY', `A chave ${fieldKey || '(vazia)'} é inválida ou repetida.`);
      keys.add(fieldKey);
      const type = String(field.type || '').toUpperCase();
      if (!fieldTypes.has(type)) throw new HttpError(422, 'INVALID_FORM_TYPE', `Tipo inválido na pergunta ${fieldKey}.`);
      const sourceOptions = field.options === undefined ? [] : field.options;
      if (!Array.isArray(sourceOptions) || sourceOptions.length > 50) throw new HttpError(422, 'INVALID_FORM', `Opções inválidas na pergunta ${fieldKey}.`);
      if (optionTypes.has(type) && sourceOptions.length < 2) throw new HttpError(422, 'INVALID_FORM', `A pergunta ${fieldKey} precisa de ao menos duas opções.`);
      const optionValues = new Set();
      const options = sourceOptions.map((option) => {
        const value = text(option.value, 'Valor da opção', 160);
        if (optionValues.has(value)) throw new HttpError(422, 'INVALID_FORM', `Opção repetida na pergunta ${fieldKey}.`);
        optionValues.add(value);
        return { value, label: text(option.label, 'Nome da opção', 180) };
      });
      return {
        fieldKey,
        label: text(field.label, 'Pergunta', 255),
        helpText: optionalText(field.helpText, 2000),
        type,
        isRequired: field.isRequired === true,
        isSensitive: field.isSensitive === true,
        isPrivate: field.isPrivate !== false,
        validation: plainObject(field.validation, 'Validação'),
        conditionalLogic: plainObject(field.conditionalLogic, 'Condição'),
        options
      };
    });
    return {
      title: text(section.title, 'Título da seção', 180),
      description: optionalText(section.description, 2000),
      fields
    };
  });
  return {
    title: text(input.title, 'Título do formulário', 180),
    introduction: optionalText(input.introduction, 5000),
    isPublished: input.isPublished === true,
    consents,
    sections
  };
}
