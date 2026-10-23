import { handleRequest } from '../backedb/src/server.js';

export default async function handler(request, response) {
  const rawPath = request.query?.path;
  const path = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '').replace(/^\/+/, '');
  const url = new URL(request.url, 'http://localhost');
  url.searchParams.delete('path');
  const query = url.searchParams.toString();
  request.url = `/api/v1/${path}${query ? `?${query}` : ''}`;
  return handleRequest(request, response);
}
