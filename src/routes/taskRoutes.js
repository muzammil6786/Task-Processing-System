const { Router }          = require("express");
const taskController      = require("../controllers/taskController");
const { authenticate }    = require("../middleware/auth");
const { validate, rules } = require("../middleware/validate");
const { param }           = require("express-validator");
const { body } = require("express-validator"); // add to existing import



const router = Router();

// All task routes require authentication
router.use(authenticate);

/**
 * @route  POST /tasks
 * @desc   Submit a new task for processing
 * @access Protected
 */
router.post("/",
  rules.createTask,
  validate,
  taskController.createTask
);

/**
 * @route  PATCH /tasks/:id/status
 * @desc   Manually update a task's status
 * @access Protected (owner only)
 */
router.patch("/:id/status",
  [
    param("id").isUUID().withMessage("Invalid task ID"),
    body("status")
      .isIn(["pending", "processing", "completed", "failed"])
      .withMessage("Status must be: pending, processing, completed, or failed"),
    body("message").optional().isString(),
  ],
  validate,
  taskController.updateTaskStatus
);

/**
 * @route  GET /tasks
 * @desc   List all tasks for the authenticated user (paginated)
 * @query  ?status=pending|processing|completed|failed
 * @query  ?type=data_processing|report_generation|...
 * @query  ?limit=20&offset=0
 * @access Protected
 */
router.get("/", taskController.listTasks);

/**
 * @route  GET /tasks/:id
 * @desc   Get details of a specific task
 * @access Protected (owner only)
 */
router.get("/:id",
  [param("id").isUUID().withMessage("Invalid task ID")],
  validate,
  taskController.getTask
);

/**
 * @route  GET /tasks/:id/logs
 * @desc   Get the full audit log for a task
 * @access Protected (owner only)
 */
router.get("/:id/logs",
  [param("id").isUUID().withMessage("Invalid task ID")],
  validate,
  taskController.getTaskLogs
);

/**
 * @route  DELETE /tasks/:id
 * @desc   Cancel a pending task
 * @access Protected (owner only)
 */
router.delete("/:id",
  [param("id").isUUID().withMessage("Invalid task ID")],
  validate,
  taskController.cancelTask
);

module.exports = router;
