const { Router }                 = require("express");
const authController             = require("../controllers/authController");
const { validate, rules }        = require("../middleware/validate");

const router = Router();

/**
 * @route  POST /auth/register
 * @desc   Create a new user account
 * @access Public
 */
router.post("/register",rules.register,validate,authController.register);

/**
 * @route  POST /auth/login
 * @desc   Authenticate and receive tokens
 * @access Public
 */
router.post("/login",rules.login,validate,authController.login);

/**
 * @route  POST /auth/refresh
 * @desc   Rotate refresh token and get a new access token
 * @access Public (requires valid refresh token in cookie or body)
 */
router.post("/refresh", authController.refresh);

/**
 * @route  POST /auth/logout
 * @desc   Revoke the refresh token
 * @access Public
 */
router.post("/logout", authController.logout);


module.exports = router;
