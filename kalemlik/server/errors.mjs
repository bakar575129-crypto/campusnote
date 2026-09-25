export class HttpError extends Error {
  /** @param {number} status @param {string} message @param {string} [code] @param {object} [extra] */
  constructor(status, message, code, extra) {
    super(message);
    this.status = status;
    if (code) this.code = code;
    if (extra) this.extra = extra;
  }
}
export const badRequest = (m, code) => new HttpError(400, m, code);
export const notFound = (m = 'Kayıt bulunamadı.') => new HttpError(404, m, 'NOT_FOUND');
