const Task = require("../models/Task");
const mongoose = require("mongoose");

const STATUSES = ["Pending", "In Progress", "Completed"];
const PRIORITIES = ["Low", "Medium", "High"];
const TASK_FIELDS = ["title", "description", "status", "priority", "dueDate"];
const TASK_QUERY_FIELDS = ["search", "status", "priority", "sort", "page", "limit"];
const SORT_OPTIONS = ["newest", "oldest", "dueDate", "priority"];
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePositiveInteger = (value, field, fallback, max = Number.MAX_SAFE_INTEGER) => {
  if (value === undefined) return { value: fallback };
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return { error: `${field} must be a positive integer` };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > max) {
    return { error: `${field} must be no greater than ${max}` };
  }
  return { value: parsed };
};

const validateTaskQuery = (query) => {
  const unknownField = Object.keys(query).find((field) => !TASK_QUERY_FIELDS.includes(field));
  if (unknownField) return { error: `Unknown query parameter: ${unknownField}` };

  const { value: page, error: pageError } = parsePositiveInteger(query.page, "page", 1);
  if (pageError) return { error: pageError };
  const { value: limit, error: limitError } = parsePositiveInteger(
    query.limit,
    "limit",
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );
  if (limitError) return { error: limitError };

  if (query.search !== undefined && typeof query.search !== "string") {
    return { error: "search must be text" };
  }
  if (query.search && query.search.length > 100) {
    return { error: "search cannot exceed 100 characters" };
  }
  if (query.status !== undefined && !STATUSES.includes(query.status)) {
    return { error: `Status must be one of: ${STATUSES.join(", ")}` };
  }
  if (query.priority !== undefined && !PRIORITIES.includes(query.priority)) {
    return { error: `Priority must be one of: ${PRIORITIES.join(", ")}` };
  }
  if (query.sort !== undefined && !SORT_OPTIONS.includes(query.sort)) {
    return { error: `Sort must be one of: ${SORT_OPTIONS.join(", ")}` };
  }

  return { page, limit, sort: query.sort || "newest" };
};

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
      if (typeof body.dueDate !== "string") {
        return { error: "Please provide a valid due date" };
      }
      const dueDate = new Date(body.dueDate);
      if (Number.isNaN(dueDate.getTime())) {
        return { error: "Please provide a valid due date" };
      }
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate);
      if (isDateOnly && dueDate.toISOString().slice(0, 10) !== body.dueDate) {
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
  res.status(201).json({ success: true, message: "Task created successfully", task });
};

const getTasks = async (req, res) => {
  const parsed = validateTaskQuery(req.query);
  if (parsed.error) {
    return res.status(400).json({ success: false, message: parsed.error });
  }

  const { page, limit, sort } = parsed;
  const filter = { user: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.search) {
    const search = new RegExp(escapeRegex(req.query.search.trim()), "i");
    filter.$or = [{ title: search }, { description: search }];
  }

  const totalTasks = await Task.countDocuments(filter);
  const totalPages = Math.ceil(totalTasks / limit);
  const currentPage = Math.min(page, totalPages || 1);
  const pipeline = [{ $match: filter }];

  if (sort === "priority") {
    pipeline.push({
      $addFields: {
        __priorityOrder: {
          $switch: {
            branches: [
              { case: { $eq: ["$priority", "High"] }, then: 3 },
              { case: { $eq: ["$priority", "Medium"] }, then: 2 },
              { case: { $eq: ["$priority", "Low"] }, then: 1 },
            ],
            default: 0,
          },
        },
      },
    });
  } else if (sort === "dueDate") {
    pipeline.push({
      $addFields: {
        __hasNoDueDate: { $eq: [{ $ifNull: ["$dueDate", null] }, null] },
      },
    });
  }

  const sortFields = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    dueDate: { __hasNoDueDate: 1, dueDate: 1, createdAt: -1 },
    priority: { __priorityOrder: -1, createdAt: -1 },
  };
  pipeline.push(
    { $sort: sortFields[sort] },
    { $skip: (currentPage - 1) * limit },
    { $limit: limit },
    { $project: { __priorityOrder: 0, __hasNoDueDate: 0 } }
  );

  const tasks = await Task.aggregate(pipeline);
  res.status(200).json({
    success: true,
    message: "Tasks retrieved successfully",
    count: totalTasks,
    tasks,
    currentPage,
    totalPages,
    totalTasks,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
  });
};

const getTaskStats = async (req, res) => {
  const [stats] = await Task.aggregate([
    { $match: { user: req.user._id } },
    {
      $group: {
        _id: null,
        totalTasks: { $sum: 1 },
        pendingTasks: {
          $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] },
        },
        inProgressTasks: {
          $sum: { $cond: [{ $eq: ["$status", "In Progress"] }, 1, 0] },
        },
        completedTasks: {
          $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalTasks: 1,
        pendingTasks: 1,
        inProgressTasks: 1,
        completedTasks: 1,
        completionPercentage: {
          $cond: [
            { $gt: ["$totalTasks", 0] },
            {
              $round: [
                { $multiply: [{ $divide: ["$completedTasks", "$totalTasks"] }, 100] },
                0,
              ],
            },
            0,
          ],
        },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    message: "Task statistics retrieved successfully",
    stats: stats || {
      totalTasks: 0,
      pendingTasks: 0,
      inProgressTasks: 0,
      completedTasks: 0,
      completionPercentage: 0,
    },
  });
};

const getTask = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid task ID" });
  }
  const task = await Task.findOne({ _id: req.params.id, user: req.user._id });
  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }
  res.status(200).json({ success: true, message: "Task retrieved successfully", task });
};

const updateTask = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid task ID" });
  }
  const { fields, error } = validateTaskFields(req.body);
  if (error) return res.status(400).json({ success: false, message: error });

  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: fields },
    { returnDocument: "after", runValidators: true }
  );
  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }
  res.status(200).json({ success: true, message: "Task updated successfully", task });
};

const updateTaskStatus = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid task ID" });
  }
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
    { returnDocument: "after", runValidators: true }
  );
  if (!task) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }
  res.status(200).json({ success: true, message: "Task status updated successfully", task });
};

const deleteTask = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid task ID" });
  }
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
  getTaskStats,
  getTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
};