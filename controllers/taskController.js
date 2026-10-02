const Task = require("../models/Task");

const STATUSES = ["Pending", "In Progress", "Completed"];
const PRIORITIES = ["Low", "Medium", "High"];
const TASK_FIELDS = ["title", "description", "status", "priority", "dueDate"];

const validateTaskFields = (body, requireTitle = false) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Please provide task details" };
  }

  const unknownField = Object.keys(body).find((field) => !TASK_FIELDS.includes(field));
  if (unknownField) return { error: `Unknown task field: ${unknownField}` };

  const fields = {};
  if (requireTitle && !Object.hasOwn(body, "title")) {
    return { error: "Task title is required" };
  }

  if (Object.hasOwn(body, "title")) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return { error: "Task title is required" };
    }
    if (body.title.trim().length > 120) {
      return { error: "Task title cannot exceed 120 characters" };
    }
    fields.title = body.title.trim();
  }

  if (Object.hasOwn(body, "description")) {
    if (typeof body.description !== "string") {
      return { error: "Task description must be text" };
    }
    if (body.description.trim().length > 2000) {
      return { error: "Task description cannot exceed 2000 characters" };
    }
    fields.description = body.description.trim();
  }

  if (Object.hasOwn(body, "status")) {
    if (!STATUSES.includes(body.status)) {
      return { error: `Status must be one of: ${STATUSES.join(", ")}` };
    }
    fields.status = body.status;
  }

  if (Object.hasOwn(body, "priority")) {
    if (!PRIORITIES.includes(body.priority)) {
      return { error: `Priority must be one of: ${PRIORITIES.join(", ")}` };
    }
    fields.priority = body.priority;
  }

  if (Object.hasOwn(body, "dueDate")) {
    if (body.dueDate === null || body.dueDate === "") {
      fields.dueDate = null;
    } else {
      const dueDate = new Date(body.dueDate);
      if (Number.isNaN(dueDate.getTime())) {
        return { error: "Please provide a valid due date" };
      }
      fields.dueDate = dueDate;
    }
  }

  if (!Object.keys(fields).length) return { error: "Please provide fields to update" };
  return { fields };
};

const createTask = async (req, res) => {
  const { fields, error } = validateTaskFields(req.body, true);
  if (error) return res.status(400).json({ success: false, message: error });

  const task = await Task.create({ ...fields, user: req.user._id });
  res.status(201).json({ success: true, task });
};

const getTasks = async (req, res) => {
  const tasks = await Task.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, count: tasks.length, tasks });
};

const getTask = async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, user: req.user._id });
  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }
  res.status(200).json({ success: true, task });
};

const updateTask = async (req, res) => {
  const { fields, error } = validateTaskFields(req.body);
  if (error) return res.status(400).json({ success: false, message: error });

  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: fields },
    { new: true, runValidators: true }
  );
  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }
  res.status(200).json({ success: true, task });
};

const updateTaskStatus = async (req, res) => {
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Status must be one of: ${STATUSES.join(", ")}`,
    });
  }

  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { status } },
    { new: true, runValidators: true }
  );
  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }
  res.status(200).json({ success: true, task });
};

const deleteTask = async (req, res) => {
  const task = await Task.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });
  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }
  res.status(200).json({ success: true, message: "Task deleted successfully" });
};

module.exports = {
  createTask,
  getTasks,
  getTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
};