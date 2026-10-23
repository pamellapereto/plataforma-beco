import { sendJson } from '../lib/http.js';

export const apiView = Object.freeze({
  resource(response, data, statusCode = 200) {
    sendJson(response, statusCode, { data });
  },

  collection(response, data, meta = {}) {
    sendJson(response, 200, { data, meta: { total: data.length, ...meta } });
  },

  empty(response) {
    sendJson(response, 204, {});
  }
});
