/**
 * Send a successful response.
 *
 * @param {import('express').Response} res
 * @param {object} options
 * @param {*}      options.data
 * @param {string} [options.message]
 * @param {number} [options.statusCode=200]
 * @param {object} [options.meta]        pagination etc.
 */
const success = (res, { data = null, message = "Success", statusCode = 200, meta = undefined } = {}) => {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

/**
 * Send an error response.
 *
 * @param {import('express').Response} res
 * @param {object} options
 * @param {string} [options.message]
 * @param {number} [options.statusCode=500]
 * @param {string} [options.code]        machine-readable error code
 * @param {*}      [options.errors]      validation error array etc.
 */
const error = (res, { message = "Internal server error", statusCode = 500, code = "INTERNAL_ERROR", errors = undefined } = {}) => {
  const body = { success: false, error: { message, code } };
  if (errors) body.error.details = errors;
  return res.status(statusCode).json(body);
};

module.exports = { success, error };
