const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Notification = require("../models/Notification");
const Task = require("../models/Task");
const {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../controllers/notificationController");
const { getDueReminders } = require("../controllers/taskController");

const invoke = async (handler, userId, params = {}, query = {}) => {
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

  await handler({ user: { _id: userId }, params, query }, response);
  return response;
};

test("reminder notifications persist, remain user-specific, and keep read state", async (t) => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  t.after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  await Notification.init();
  await Task.create({
    title: "Pay rent",
    user: userA,
    status: "Pending",
    dueDate: new Date("2020-01-01T00:00:00.000Z"),
    dueTime: "09:00",
    dueTimeZone: "UTC",
    reminder: "At Due Time",
  });

  const reminderResponse = await invoke(
    getDueReminders,
    userA,
    {},
    { timeZone: "UTC" }
  );
  assert.equal(reminderResponse.statusCode, 200);
  assert.equal(reminderResponse.body.reminders.length, 1);

  const initialList = await invoke(getNotifications, userA);
  assert.equal(initialList.body.notifications.length, 1);
  assert.equal(initialList.body.unreadCount, 1);
  const notificationId = initialList.body.notifications[0]._id.toString();
  assert.equal(initialList.body.notifications[0].user.toString(), userA.toString());
  assert.equal(initialList.body.notifications[0].read, false);

  const otherUserList = await invoke(getNotifications, userB);
  assert.deepEqual(otherUserList.body.notifications, []);
  assert.equal(otherUserList.body.unreadCount, 0);
  const otherUserRead = await invoke(markNotificationRead, userB, {
    id: notificationId,
  });
  assert.equal(otherUserRead.statusCode, 404);

  const unreadCount = await invoke(getUnreadCount, userA);
  assert.equal(unreadCount.body.unreadCount, 1);
  const markedRead = await invoke(markNotificationRead, userA, {
    id: notificationId,
  });
  assert.equal(markedRead.body.notification.read, true);
  assert.equal(markedRead.body.unreadCount, 0);

  const reminderNotification = initialList.body.notifications[0];
  await Notification.updateOne(
    { user: userA, dedupeKey: reminderNotification.dedupeKey },
    {
      $setOnInsert: {
        user: userA,
        type: "task_reminder",
        title: "Task reminder",
        message: "Duplicate event",
        dedupeKey: reminderNotification.dedupeKey,
      },
    },
    { upsert: true }
  );
  assert.equal(await Notification.countDocuments({ user: userA }), 1);
  assert.equal(
    (await Notification.findById(notificationId).lean()).read,
    true
  );

  await Notification.create({
    user: userA,
    type: "task_reminder",
    title: "Another reminder",
    message: "Second task reminder",
    dedupeKey: "test-second-reminder",
  });
  const markedAll = await invoke(markAllNotificationsRead, userA);
  assert.equal(markedAll.body.modifiedCount, 1);
  assert.equal(markedAll.body.unreadCount, 0);

  const repeatedReminder = await invoke(
    getDueReminders,
    userA,
    {},
    { timeZone: "UTC" }
  );
  assert.equal(repeatedReminder.body.reminders.length, 0);
  assert.equal(await Notification.countDocuments({ user: userA }), 2);

  await mongoose.disconnect();
  await mongoose.connect(mongo.getUri());
  const persisted = await Notification.find({ user: userA })
    .sort({ createdAt: 1 })
    .lean();
  assert.equal(persisted.length, 2);
  assert.ok(persisted.every(({ read }) => read));
  assert.equal(await Notification.countDocuments({ user: userA, read: false }), 0);
});
