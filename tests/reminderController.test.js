const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const Task = require("../models/Task");
const Notification = require("../models/Notification");
const { getDueReminders } = require("../controllers/taskController");

const USER_ID = "authenticated-user";
const dueTask = (overrides = {}) => ({
  _id: "task-1",
  user: USER_ID,
  title: "Pay rent",
  status: "Pending",
  dueDate: new Date("2020-01-01T00:00:00.000Z"),
  dueTime: "09:00",
  dueTimeZone: "UTC",
  reminder: "At Due Time",
  reminderSentAt: null,
  ...overrides,
});

const invoke = async () => {
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

  await getDueReminders(
    { user: { _id: USER_ID }, query: { timeZone: "UTC" } },
    response
  );
  return response;
};

test("task schema stores the reminder selection and persisted delivery state", async () => {
  const task = new Task({
    title: "Review proposal",
    user: new mongoose.Types.ObjectId(),
    reminder: "30 minutes before",
    dueDate: new Date("2026-10-07T00:00:00.000Z"),
    dueTime: "17:00",
    dueTimeZone: "America/Los_Angeles",
  });

  assert.equal(task.reminder, "30 minutes before");
  assert.equal(task.reminderSentAt, null);
  await task.validate();
});

test("due reminders are claimed once and completed or deleted tasks are skipped", async (t) => {
  const originalFind = Task.find;
  const originalFindOneAndUpdate = Task.findOneAndUpdate;
  const originalNotificationUpdateOne = Notification.updateOne;
  const notificationWrites = [];
  const tasks = [
    dueTask(),
    dueTask({ _id: "completed", status: "Completed" }),
    dueTask({ _id: "deleted", title: "Deleted task" }),
    dueTask({ _id: "no-time", dueTime: "" }),
    dueTask({ _id: "no-reminder", reminder: "No Reminder" }),
  ];
  tasks.splice(tasks.findIndex(({ _id }) => _id === "deleted"), 1);

  t.after(() => {
    Task.find = originalFind;
    Task.findOneAndUpdate = originalFindOneAndUpdate;
    Notification.updateOne = originalNotificationUpdateOne;
  });

  Task.find = (filter) => ({
    select() {
      return {
        lean: async () =>
          tasks
            .filter(
              (task) =>
                task.user === filter.user &&
                task.status !== "Completed" &&
                filter.reminder.$in.includes(task.reminder) &&
                task.reminderSentAt == null &&
                task.dueDate instanceof Date &&
                filter.dueTime.test(task.dueTime)
            )
            .map((task) => ({ ...task })),
      };
    },
  });
  Task.findOneAndUpdate = (filter, update) => ({
    select: async () => {
      const task = tasks.find(
        (candidate) =>
          candidate._id === filter._id &&
          candidate.user === filter.user &&
          candidate.status !== "Completed" &&
          candidate.reminder === filter.reminder &&
          candidate.reminderSentAt == null &&
          candidate.dueDate.getTime() === filter.dueDate.getTime() &&
          candidate.dueTime === filter.dueTime
      );
      if (!task) return null;
      task.reminderSentAt = update.$set.reminderSentAt;
      return { ...task };
    },
  });
  Notification.updateOne = async (...args) => {
    notificationWrites.push(args);
    return { upsertedCount: 1 };
  };

  const firstCheck = await invoke();
  assert.equal(firstCheck.statusCode, 200);
  assert.deepEqual(
    firstCheck.body.reminders.map(({ title }) => title),
    ["Pay rent"]
  );
  assert.ok(tasks[0].reminderSentAt instanceof Date);
  assert.equal(notificationWrites.length, 1);
  assert.deepEqual(notificationWrites[0][0], {
    user: USER_ID,
    dedupeKey: "task-reminder:task-1:2020-01-01:09:00:At Due Time",
  });
  assert.equal(notificationWrites[0][1].$setOnInsert.type, "task_reminder");
  assert.equal(
    notificationWrites[0][1].$setOnInsert.message,
    "Pay rent — At Due Time (due 2020-01-01 at 09:00)"
  );

  const secondCheck = await invoke();
  assert.equal(secondCheck.body.reminders.length, 0);
  assert.equal(notificationWrites.length, 1);

});
