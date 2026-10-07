const express = require("express");
const {
  createTask,
  getTasks,
  getTaskStats,
  getDueReminders,
  getTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
} = require("../controllers/taskController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.route("/").post(createTask).get(getTasks);
router.get("/stats", getTaskStats);
router.get("/reminders/due", getDueReminders);
router.patch("/:id/status", updateTaskStatus);
router.route("/:id").get(getTask).put(updateTask).delete(deleteTask);

module.exports = router;