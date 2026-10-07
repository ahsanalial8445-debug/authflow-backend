const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const Task = require("../models/Task");
const { updateTask, updateTaskStatus } = require("../controllers/taskController");
const { getNextDueDate } = require("../utils/recurrence");

const USER_ID = new mongoose.Types.ObjectId();
const TASK_ID = new mongoose.Types.ObjectId();

const invokeStatusUpdate = async (status = "Completed") => {
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  await updateTaskStatus(
    { params: { id: TASK_ID.toString() }, user: { _id: USER_ID }, body: { status } },
    response
  );
  return response;
};

const invokeTaskUpdate = async () => {
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  await updateTask(
    {
      params: { id: TASK_ID.toString() },
      user: { _id: USER_ID },
      body: { status: "Completed" },
    },
    response
  );
  return response;
};

test("calculates daily and weekly recurrence in UTC", () => {
  const dueDate = new Date("2026-10-07T00:00:00.000Z");
  assert.equal(getNextDueDate(dueDate, "Daily").toISOString(), "2026-10-08T00:00:00.000Z");
  assert.equal(getNextDueDate(dueDate, "Weekly").toISOString(), "2026-10-14T00:00:00.000Z");
});

test("calculates monthly recurrence with safe month-end clamping", () => {
  assert.equal(
    getNextDueDate(new Date("2026-01-31T00:00:00.000Z"), "Monthly").toISOString(),
    "2026-02-28T00:00:00.000Z"
  );
  assert.equal(
    getNextDueDate(new Date("2024-01-31T00:00:00.000Z"), "Monthly").toISOString(),
    "2024-02-29T00:00:00.000Z"
  );
});

test("does not calculate unsupported or invalid recurrence dates", () => {
  assert.equal(getNextDueDate(null, "Daily"), null);
  assert.equal(getNextDueDate(new Date("invalid"), "Daily"), null);
  assert.equal(getNextDueDate(new Date(), "Custom"), null);
  assert.equal(
    getNextDueDate(new Date("+275760-09-13T00:00:00.000Z"), "Daily"),
    null
  );
});

test("completion creates one pending occurrence with copied task and reminder settings", async (t) => {
  const originalFindOneAndUpdate = Task.findOneAndUpdate;
  const originalFindOne = Task.findOne;
  const originalCreate = Task.create;
  const task = {
    _id: TASK_ID,
    title: "Study JavaScript",
    description: "Practice closures",
    status: "Completed",
    priority: "High",
    dueDate: new Date("2026-10-07T00:00:00.000Z"),
    dueTime: "17:00",
    dueTimeZone: "America/Los_Angeles",
    reminder: "30 minutes before",
    reminderSentAt: new Date("2026-10-07T23:30:00.000Z"),
    recurrence: "Daily",
    recurrenceDetails: "",
    subtasks: [{ title: "Review notes", completed: true }],
    labels: ["study"],
    important: true,
    taskList: "School",
  };
  let generatedTask;

  t.after(() => {
    Task.findOneAndUpdate = originalFindOneAndUpdate;
    Task.findOne = originalFindOne;
    Task.create = originalCreate;
  });

  Task.findOneAndUpdate = async () => task;
  Task.findOne = async () => null;
  Task.create = async (fields) => {
    generatedTask = fields;
    return { ...fields, _id: new mongoose.Types.ObjectId() };
  };

  const response = await invokeStatusUpdate();

  assert.equal(response.statusCode, 200);
  assert.equal(generatedTask.title, task.title);
  assert.equal(generatedTask.description, task.description);
  assert.equal(generatedTask.priority, "High");
  assert.deepEqual(generatedTask.labels, ["study"]);
  assert.equal(generatedTask.taskList, "School");
  assert.equal(generatedTask.recurrence, "Daily");
  assert.equal(generatedTask.reminder, "30 minutes before");
  assert.equal(generatedTask.dueTimeZone, "America/Los_Angeles");
  assert.equal(generatedTask.reminderSentAt, null);
  assert.equal(generatedTask.dueDate.toISOString(), "2026-10-08T00:00:00.000Z");
  assert.equal(generatedTask.status, "Pending");
  assert.deepEqual(generatedTask.subtasks, [{ title: "Review notes", completed: false }]);
  assert.equal(generatedTask.recurrenceSource, TASK_ID);
  assert.equal(generatedTask.user, USER_ID);
});

test("editing a task to Completed also creates its next occurrence", async (t) => {
  const originalFindOneAndUpdate = Task.findOneAndUpdate;
  const originalFindOne = Task.findOne;
  const originalCreate = Task.create;
  const sourceTask = {
    _id: TASK_ID,
    status: "Pending",
    recurrence: "Weekly",
    dueDate: new Date("2026-10-07T00:00:00.000Z"),
    subtasks: [],
  };
  const completedTask = { ...sourceTask, status: "Completed" };
  let generatedTask;

  t.after(() => {
    Task.findOneAndUpdate = originalFindOneAndUpdate;
    Task.findOne = originalFindOne;
    Task.create = originalCreate;
  });

  Task.findOne = async () => sourceTask;
  Task.findOneAndUpdate = async (filter) => {
    assert.equal(filter.status.$ne, "Completed");
    return completedTask;
  };
  Task.create = async (fields) => {
    generatedTask = fields;
    return fields;
  };

  const response = await invokeTaskUpdate();

  assert.equal(response.statusCode, 200);
  assert.equal(generatedTask.dueDate.toISOString(), "2026-10-14T00:00:00.000Z");
});

test("generation failure returns an error while leaving completion persisted", async (t) => {
  const originalFindOneAndUpdate = Task.findOneAndUpdate;
  const originalFindOne = Task.findOne;
  const originalCreate = Task.create;
  const originalConsoleError = console.error;
  let persistedStatus;

  t.after(() => {
    Task.findOneAndUpdate = originalFindOneAndUpdate;
    Task.findOne = originalFindOne;
    Task.create = originalCreate;
    console.error = originalConsoleError;
  });

  Task.findOneAndUpdate = async (_filter, update) => {
    persistedStatus = update.$set.status;
    return {
      _id: TASK_ID,
      status: persistedStatus,
      recurrence: "Daily",
      dueDate: new Date("2026-10-07T00:00:00.000Z"),
      subtasks: [],
    };
  };
  Task.findOne = async () => null;
  Task.create = async () => {
    throw new Error("database write failed");
  };
  console.error = () => {};

  const response = await invokeStatusUpdate();

  assert.equal(response.statusCode, 500);
  assert.match(response.body.message, /task was completed/i);
  assert.equal(persistedStatus, "Completed");
});

test("completion does not generate a second occurrence for an already completed task", async (t) => {
  const originalFindOneAndUpdate = Task.findOneAndUpdate;
  const originalFindOne = Task.findOne;
  const originalCreate = Task.create;
  const completedTask = { _id: TASK_ID, status: "Completed", recurrence: "Daily" };
  let createCalls = 0;

  t.after(() => {
    Task.findOneAndUpdate = originalFindOneAndUpdate;
    Task.findOne = originalFindOne;
    Task.create = originalCreate;
  });

  Task.findOneAndUpdate = async () => null;
  Task.findOne = async () => completedTask;
  Task.create = async () => {
    createCalls += 1;
  };

  const response = await invokeStatusUpdate();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.task, completedTask);
  assert.equal(createCalls, 0);
});

test("a duplicate occurrence key returns the already-persisted occurrence", async (t) => {
  const originalFindOneAndUpdate = Task.findOneAndUpdate;
  const originalFindOne = Task.findOne;
  const originalCreate = Task.create;
  const existingOccurrence = { _id: new mongoose.Types.ObjectId(), status: "Pending" };

  t.after(() => {
    Task.findOneAndUpdate = originalFindOneAndUpdate;
    Task.findOne = originalFindOne;
    Task.create = originalCreate;
  });

  Task.findOneAndUpdate = async () => ({
    _id: TASK_ID,
    status: "Completed",
    recurrence: "Daily",
    dueDate: new Date("2026-10-07T00:00:00.000Z"),
    subtasks: [],
  });
  Task.findOne = async (filter) => {
    assert.equal(filter.recurrenceSource, TASK_ID);
    return existingOccurrence;
  };
  Task.create = async () => {
    const error = new Error("duplicate occurrence");
    error.code = 11000;
    throw error;
  };

  const response = await invokeStatusUpdate();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.nextTask, existingOccurrence);
});

test("non-recurring completion does not create another task", async (t) => {
  const originalFindOneAndUpdate = Task.findOneAndUpdate;
  const originalFindOne = Task.findOne;
  const originalCreate = Task.create;
  let createCalls = 0;

  t.after(() => {
    Task.findOneAndUpdate = originalFindOneAndUpdate;
    Task.findOne = originalFindOne;
    Task.create = originalCreate;
  });

  Task.findOneAndUpdate = async () => ({ _id: TASK_ID, status: "Completed", recurrence: "None" });
  Task.findOne = async () => null;
  Task.create = async () => {
    createCalls += 1;
  };

  const response = await invokeStatusUpdate();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.nextTask, undefined);
  assert.equal(createCalls, 0);
});

test("task schema uniquely links each generated occurrence to its source", () => {
  const task = new Task({
    title: "Review proposal",
    user: USER_ID,
    recurrenceSource: TASK_ID,
  });
  const sourceIndex = Task.schema.indexes().find(([keys]) => keys.recurrenceSource === 1);

  assert.equal(task.recurrenceSource.toString(), TASK_ID.toString());
  assert.deepEqual(sourceIndex, [{ recurrenceSource: 1 }, { unique: true, sparse: true }]);
});
