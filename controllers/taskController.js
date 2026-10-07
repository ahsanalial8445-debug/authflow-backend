const Task = require("../models/Task");
const Notification = require("../models/Notification");
const mongoose = require("mongoose");
const { getReminderTimes, isValidTimeZone } = require("../utils/reminders");
const { getNextDueDate } = require("../utils/recurrence");

const STATUSES = ["Pending", "In Progress", "Completed"];
const PRIORITIES = ["Low", "Medium", "High"];
const REMINDERS = [
  "No Reminder",
  "At Due Time",
  "10 minutes before",
  "30 minutes before",
  "1 hour before",
  "1 day before",
];
const RECURRENCES = ["None", "Daily", "Weekly", "Monthly", "Custom"];
const TASK_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "dueDate",
  "dueTime",
  "dueTimeZone",
  "reminder",
  "recurrence",
  "recurrenceDetails",
  "subtasks",
  "labels",
  "important",
  "taskList",
];
const TASK_QUERY_FIELDS = [
  "search",
  "status",
  "priority",
  "sort",
  "page",
  "limit",
  "label",
  "important",
  "taskList",
];
const SORT_OPTIONS = ["newest", "oldest", "dueDate", "priority", "important"];
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

const normalizeLabels = (value) => {
  if (value === undefined || value === null) return [];
  if (typeof value !== "string") {
    throw new Error("Labels must be a comma-separated text value");
  }

  return [...new Set(
    value
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label) => label.slice(0, 30))
  )];
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
  if (query.label !== undefined && typeof query.label !== "string") {
    return { error: "label must be text" };
  }
  if (query.taskList !== undefined && typeof query.taskList !== "string") {
    return { error: "taskList must be text" };
  }
  if (query.taskList && query.taskList.length > 50) {
    return { error: "taskList cannot exceed 50 characters" };
  }
  if (query.important !== undefined) {
    if (query.important !== "true" && query.important !== "false") {
      return { error: "important must be true or false" };
    }
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

  if (Object.hasOwn(body, "dueTime")) {
    if (body.dueTime === null || body.dueTime === "") {
      fields.dueTime = "";
    } else {
      if (typeof body.dueTime !== "string" || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(body.dueTime)) {
        return { error: "Please provide a valid due time in HH:MM format" };
      }
      fields.dueTime = body.dueTime;
    }
  }

  if (Object.hasOwn(body, "dueTimeZone")) {
    if (typeof body.dueTimeZone !== "string" || body.dueTimeZone.length > 100) {
      return { error: "Please provide a valid due time zone" };
    }
    if (body.dueTimeZone && !isValidTimeZone(body.dueTimeZone)) {
      return { error: "Please provide a valid due time zone" };
    }
    fields.dueTimeZone = body.dueTimeZone;
  }

  if (Object.hasOwn(body, "reminder")) {
    if (!REMINDERS.includes(body.reminder)) {
      return { error: `Reminder must be one of: ${REMINDERS.join(", ")}` };
    }
    fields.reminder = body.reminder;
  }

  if (Object.hasOwn(body, "recurrence")) {
    if (!RECURRENCES.includes(body.recurrence)) {
      return { error: `Recurrence must be one of: ${RECURRENCES.join(", ")}` };
    }
    fields.recurrence = body.recurrence;
  }

  if (Object.hasOwn(body, "recurrenceDetails")) {
    if (typeof body.recurrenceDetails !== "string") {
      return { error: "Recurrence details must be text" };
    }
    const recurrenceDetails = body.recurrenceDetails.trim();
    if (recurrenceDetails.length > 120) {
      return { error: "Recurrence details cannot exceed 120 characters" };
    }
    fields.recurrenceDetails = recurrenceDetails;
  }

  if (Object.hasOwn(body, "subtasks")) {
    if (!Array.isArray(body.subtasks)) {
      return { error: "Subtasks must be an array" };
    }

    const subtasks = body.subtasks
      .map((subtask) => {
        if (!subtask || typeof subtask !== "object" || Array.isArray(subtask)) {
          return null;
        }
        const title = typeof subtask.title === "string" ? subtask.title.trim() : "";
        if (!title || title.length > 120) {
          return null;
        }
        return {
          title,
          completed: Boolean(subtask.completed),
        };
      })
      .filter(Boolean);

    if (subtasks.length !== body.subtasks.length) {
      return { error: "Please provide valid subtasks" };
    }
    fields.subtasks = subtasks;
  }

  if (Object.hasOwn(body, "labels")) {
    if (body.labels === undefined || body.labels === null) {
      fields.labels = [];
    } else if (typeof body.labels === "string") {
      try {
        fields.labels = normalizeLabels(body.labels);
      } catch (error) {
        return { error: error.message };
      }
    } else if (Array.isArray(body.labels)) {
      const labels = body.labels
        .map((label) => (typeof label === "string" ? label.trim() : ""))
        .filter(Boolean)
        .slice(0, 20);
      if (labels.some((label) => label.length > 30)) {
        return { error: "Label cannot exceed 30 characters" };
      }
      fields.labels = [...new Set(labels)];
    } else {
      return { error: "Labels must be text or an array of text values" };
    }
  }

  if (Object.hasOwn(body, "important")) {
    if (typeof body.important !== "boolean") {
      return { error: "important must be true or false" };
    }
    fields.important = body.important;
  }

  if (Object.hasOwn(body, "taskList")) {
    if (typeof body.taskList !== "string") {
      return { error: "Task list must be text" };
    }
    const taskList = body.taskList.trim();
    if (!taskList) {
      fields.taskList = "My Tasks";
    } else {
      if (taskList.length > 50) {
        return { error: "Task list name cannot exceed 50 characters" };
      }
      fields.taskList = taskList;
    }
  }

  if (!Object.keys(fields).length) return { error: "Please provide fields to update" };
  return { fields };
};

const createNextOccurrence = async (task, userId) => {
  if (!["Daily", "Weekly", "Monthly"].includes(task.recurrence) || !task.dueDate) {
    return null;
  }

  const dueDate = getNextDueDate(task.dueDate, task.recurrence);
  if (!dueDate) return null;

  try {
    return await Task.create({
      title: task.title,
      description: task.description,
      status: "Pending",
      priority: task.priority,
      dueDate,
      dueTime: task.dueTime,
      dueTimeZone: task.dueTimeZone,
      reminder: task.reminder,
      reminderSentAt: null,
      recurrence: task.recurrence,
      recurrenceDetails: task.recurrenceDetails,
      recurrenceSource: task._id,
      subtasks: task.subtasks.map(({ title }) => ({ title, completed: false })),
      labels: task.labels,
      important: task.important,
      taskList: task.taskList,
      user: userId,
    });
  } catch (error) {
    if (error.code === 11000) {
      const existingOccurrence = await Task.findOne({
        user: userId,
        recurrenceSource: task._id,
      });
      if (existingOccurrence) return existingOccurrence;
    }
    throw error;
  }
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
  if (req.query.taskList && req.query.taskList !== "All lists") {
    filter.taskList = req.query.taskList.trim();
  }
  if (req.query.important !== undefined) {
    filter.important = req.query.important === "true";
  }
  if (req.query.label) {
    const labelValue = req.query.label.trim();
    filter.labels = new RegExp(`^${escapeRegex(labelValue)}$`, "i");
  }
  if (req.query.search) {
    const search = new RegExp(escapeRegex(req.query.search.trim()), "i");
    filter.$or = [{ title: search }, { description: search }, { labels: search }];
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
        __dueDateValue: { $ifNull: ["$dueDate", new Date("9999-12-31T00:00:00.000Z")] },
      },
    });
  }

  const sortFields = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    dueDate: { __hasNoDueDate: 1, __dueDateValue: 1, createdAt: -1 },
    priority: { __priorityOrder: -1, createdAt: -1 },
    important: { important: -1, createdAt: -1 },
  };

  pipeline.push(
    { $sort: sortFields[sort] },
    { $skip: (currentPage - 1) * limit },
    { $limit: limit },
    { $project: { __priorityOrder: 0, __hasNoDueDate: 0, __dueDateValue: 0 } }
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
        pendingTasks: { $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] } },
        inProgressTasks: { $sum: { $cond: [{ $eq: ["$status", "In Progress"] }, 1, 0] } },
        completedTasks: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
        importantTasks: { $sum: { $cond: [{ $eq: ["$important", true] }, 1, 0] } },
        overdueTasks: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$dueDate", null] },
                  { $lt: ["$dueDate", new Date()] },
                  { $ne: ["$status", "Completed"] },
                ],
              },
              1,
              0,
            ],
          },
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
        importantTasks: 1,
        overdueTasks: 1,
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
      importantTasks: 0,
      overdueTasks: 0,
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

const getDueReminders = async (req, res) => {
  const requestedTimeZone = req.query.timeZone;
  if (
    requestedTimeZone !== undefined &&
    (typeof requestedTimeZone !== "string" ||
      requestedTimeZone.length > 100 ||
      !isValidTimeZone(requestedTimeZone))
  ) {
    return res.status(400).json({ success: false, message: "Please provide a valid time zone" });
  }

  const tasks = await Task.find({
    user: req.user._id,
    status: { $ne: "Completed" },
    reminder: { $in: REMINDERS.filter((reminder) => reminder !== "No Reminder") },
    reminderSentAt: null,
    dueDate: { $type: "date" },
    dueTime: /^([01]\d|2[0-3]):([0-5]\d)$/,
  })
    .select("_id title dueDate dueTime dueTimeZone reminder")
    .lean();

  const now = new Date();
  const reminders = [];
  for (const task of tasks) {
    const timeZone = task.dueTimeZone || requestedTimeZone || "UTC";
    if (!isValidTimeZone(timeZone)) continue;
    const times = getReminderTimes(task, timeZone);
    if (!times || times.reminderAt > now) continue;

    const claimedTask = await Task.findOneAndUpdate(
      {
        _id: task._id,
        user: req.user._id,
        status: { $ne: "Completed" },
        reminder: task.reminder,
        reminderSentAt: null,
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        dueTimeZone: task.dueTimeZone,
      },
      { $set: { reminderSentAt: now } },
      { returnDocument: "after" }
    ).select("_id title dueDate dueTime reminder");

    if (claimedTask) {
      const dueDate = claimedTask.dueDate.toISOString().slice(0, 10);
      const dedupeKey = `task-reminder:${claimedTask._id}:${dueDate}:${claimedTask.dueTime}:${claimedTask.reminder}`;
      try {
        await Notification.updateOne(
          { user: req.user._id, dedupeKey },
          {
            $setOnInsert: {
              user: req.user._id,
              type: "task_reminder",
              title: "Task reminder",
              message: `${claimedTask.title} — ${claimedTask.reminder} (due ${dueDate} at ${claimedTask.dueTime})`,
              read: false,
              dedupeKey,
            },
          },
          { upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );
      } catch (error) {
        console.error("Unable to save task reminder notification:", error);
      }

      reminders.push({
        taskId: claimedTask._id,
        title: claimedTask.title,
        dueDate: claimedTask.dueDate,
        dueTime: claimedTask.dueTime,
        reminder: claimedTask.reminder,
      });
    }
  }

  res.status(200).json({ success: true, reminders });
};

const updateTask = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid task ID" });
  }
  const { fields, error } = validateTaskFields(req.body);
  if (error) return res.status(400).json({ success: false, message: error });

  const currentTask = await Task.findOne({ _id: req.params.id, user: req.user._id });
  if (!currentTask) {
    return res.status(404).json({ success: false, message: "Task not found" });
  }

  const reminderScheduleChanged = ["dueDate", "dueTime", "dueTimeZone", "reminder"].some(
    (field) => {
      if (!Object.hasOwn(fields, field)) return false;
      const previousValue = currentTask[field];
      const nextValue = fields[field];
      if (previousValue instanceof Date && nextValue instanceof Date) {
        return previousValue.getTime() !== nextValue.getTime();
      }
      return previousValue !== nextValue;
    }
  );
  const update = { $set: fields };
  if (reminderScheduleChanged) update.$set.reminderSentAt = null;

  const completingTask = fields.status === "Completed" && currentTask.status !== "Completed";
  const task = await Task.findOneAndUpdate(
    completingTask
      ? { _id: req.params.id, user: req.user._id, status: { $ne: "Completed" } }
      : { _id: req.params.id, user: req.user._id },
    update,
    { returnDocument: "after", runValidators: true }
  );
  if (!task) {
    const existingTask = await Task.findOne({ _id: req.params.id, user: req.user._id });
    if (!existingTask) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    return res.status(200).json({
      success: true,
      message: "Task updated successfully",
      task: existingTask,
    });
  }

  let nextTask = null;
  if (completingTask) {
    try {
      nextTask = await createNextOccurrence(task, req.user._id);
    } catch (error) {
      console.error("Recurring task generation failed:", error);
      return res.status(500).json({
        success: false,
        message: "Task was completed, but the next recurring task could not be created",
      });
    }
  }

  res.status(200).json({
    success: true,
    message: "Task updated successfully",
    task,
    ...(nextTask ? { nextTask } : {}),
  });
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

  const filter = { _id: req.params.id, user: req.user._id };
  const task = await Task.findOneAndUpdate(
    status === "Completed" ? { ...filter, status: { $ne: "Completed" } } : filter,
    { $set: { status } },
    { returnDocument: "after", runValidators: true }
  );
  if (!task) {
    const existingTask = await Task.findOne(filter);
    if (!existingTask) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    return res.status(200).json({
      success: true,
      message: "Task status updated successfully",
      task: existingTask,
    });
  }

  let nextTask = null;
  if (status === "Completed") {
    try {
      nextTask = await createNextOccurrence(task, req.user._id);
    } catch (error) {
      console.error("Recurring task generation failed:", error);
      return res.status(500).json({
        success: false,
        message: "Task was completed, but the next recurring task could not be created",
      });
    }
  }

  res.status(200).json({
    success: true,
    message: "Task status updated successfully",
    task,
    ...(nextTask ? { nextTask } : {}),
  });
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
  getDueReminders,
  updateTask,
  updateTaskStatus,
  deleteTask,
};
