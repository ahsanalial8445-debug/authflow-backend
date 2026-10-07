const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      minlength: [1, "Task title cannot be empty"],
      maxlength: [120, "Task title cannot exceed 120 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Task description cannot exceed 2000 characters"],
      default: "",
    },
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Completed"],
      default: "Pending",
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    dueDate: {
      type: Date,
      default: null,
    },
    dueTime: {
      type: String,
      default: "",
      validate: {
        validator(value) {
          return value === "" || /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
        },
        message: "Due time must be in HH:MM format",
      },
    },
    dueTimeZone: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    reminder: {
      type: String,
      enum: [
        "No Reminder",
        "At Due Time",
        "10 minutes before",
        "30 minutes before",
        "1 hour before",
        "1 day before",
      ],
      default: "No Reminder",
    },
    reminderSentAt: {
      type: Date,
      default: null,
    },
    recurrence: {
      type: String,
      enum: ["None", "Daily", "Weekly", "Monthly", "Custom"],
      default: "None",
    },
    recurrenceDetails: {
      type: String,
      trim: true,
      maxlength: [120, "Recurrence details cannot exceed 120 characters"],
      default: "",
    },
    recurrenceSource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      immutable: true,
    },
    subtasks: [
      {
        title: {
          type: String,
          required: true,
          trim: true,
          maxlength: [120, "Subtask title cannot exceed 120 characters"],
        },
        completed: {
          type: Boolean,
          default: false,
        },
      },
    ],
    labels: [
      {
        type: String,
        trim: true,
        maxlength: [30, "Label cannot exceed 30 characters"],
      },
    ],
    important: {
      type: Boolean,
      default: false,
    },
    taskList: {
      type: String,
      trim: true,
      maxlength: [50, "Task list name cannot exceed 50 characters"],
      default: "My Tasks",
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

taskSchema.index({ user: 1, createdAt: -1 });
taskSchema.index({ user: 1, important: -1, createdAt: -1 });
taskSchema.index({ user: 1, taskList: 1, createdAt: -1 });
taskSchema.index({ recurrenceSource: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Task", taskSchema);