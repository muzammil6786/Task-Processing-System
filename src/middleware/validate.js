const { validationResult, body } = require("express-validator");
const { error }                  = require("../utils/apiResponse");

/**
 * Run after express-validator chain middleware.
 * If there are errors, returns 422; otherwise calls next().
 */
const validate = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  return error(res, {
    message:    "Validation failed",
    statusCode: 422,
    code:       "VALIDATION_ERROR",
    errors:     result.array().map((e) => ({ field: e.path, message: e.msg })),
  });
};

// ─── Shared validation rules ──────────────────────────────────────────────────

const rules = {
  register: [
    body("email")
      .isEmail().withMessage("Must be a valid email address")
      .normalizeEmail(),
    body("password")
      .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
      .matches(/[A-Z]/).withMessage("Password must contain an uppercase letter")
      .matches(/[0-9]/).withMessage("Password must contain a number"),
    body("name")
      .trim()
      .isLength({ min: 2, max: 100 }).withMessage("Name must be 2–100 characters"),
  ],

  login: [
    body("email").isEmail().withMessage("Must be a valid email").normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
  ],

  createTask: [
    body("type")
      .isIn(["data_processing", "report_generation", "email_sending", "file_conversion"])
      .withMessage("Invalid task type"),
    body("payload")
      .optional()
      .isObject().withMessage("Payload must be an object"),
    body("priority")
      .optional()
      .isInt({ min: 0, max: 10 }).withMessage("Priority must be 0–10"),
    body("maxAttempts")
      .optional()
      .isInt({ min: 1, max: 5 }).withMessage("maxAttempts must be 1–5"),
    body("scheduledAt")
      .optional()
      .isISO8601().withMessage("scheduledAt must be an ISO 8601 timestamp")
      .toDate(),
  ],

  pagination: [
    body("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    body("offset").optional().isInt({ min: 0 }).toInt(),
  ],
};

module.exports = { validate, rules };
