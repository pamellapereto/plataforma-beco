import { HttpError } from './http.js';

export async function assertStoredImage(gateway, bucket, input) {
  const path = String(input.objectPath || '');
  if (path.split('/').some(part => !part || part === '.' || part === '..')) throw new HttpError(422, 'INVALID_OBJECT_PATH', 'Caminho de arquivo inválido.');
  const split = path.lastIndexOf('/');
  const rows = await gateway.request(`storage/v1/object/list/${encodeURIComponent(bucket)}`, {
    method: 'POST', body: { prefix: path.slice(0, split), search: path.slice(split + 1), limit: 100 }
  });
  const object = rows.find(item => item.name === path.slice(split + 1) && item.id);
  if (!object) throw new HttpError(422, 'UPLOAD_NOT_FOUND', 'A imagem ainda não foi enviada. Tente novamente.');
  if (Number(object.metadata?.size) !== input.byteSize || object.metadata?.mimetype !== input.mimeType) throw new HttpError(422, 'UPLOAD_METADATA_MISMATCH', 'Os dados do arquivo não correspondem à imagem enviada.');
}
