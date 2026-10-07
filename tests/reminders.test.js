const assert = require("node:assert/strict");
const test = require("node:test");
const { getReminderTimes, isValidTimeZone } = require("../utils/reminders");

const taskAt = (date, time, reminder) => ({
  dueDate: new Date(`${date}T00:00:00.000Z`),
  dueTime: time,
  reminder,
});

test("calculates reminder times before local due time", () => {
  const { dueAt, reminderAt } = getReminderTimes(
    taskAt("2026-10-07", "17:00", "30 minutes before"),
    "America/Los_Angeles"
  );

  assert.equal(dueAt.toISOString(), "2026-10-08T00:00:00.000Z");
  assert.equal(reminderAt.toISOString(), "2026-10-07T23:30:00.000Z");
});

test("supports every existing reminder interval", () => {
  const dueDate = taskAt("2026-10-07", "17:00", "At Due Time").dueDate;
  const expectedLeads = {
    "At Due Time": 0,
    "10 minutes before": 10,
    "30 minutes before": 30,
    "1 hour before": 60,
    "1 day before": 1440,
  };

  for (const [reminder, minutes] of Object.entries(expectedLeads)) {
    const result = getReminderTimes(
      { dueDate, dueTime: "17:00", reminder },
      "UTC"
    );
    assert.equal(
      result.reminderAt.getTime(),
      result.dueAt.getTime() - minutes * 60_000
    );
  }
});

test("does not calculate reminders without valid date/time or reminder", () => {
  assert.equal(
    getReminderTimes(taskAt("2026-10-07", "", "At Due Time"), "UTC"),
    null
  );
  assert.equal(
    getReminderTimes(taskAt("invalid", "17:00", "At Due Time"), "UTC"),
    null
  );
  assert.equal(
    getReminderTimes(taskAt("2026-10-07", "17:00", "No Reminder"), "UTC"),
    null
  );
  assert.equal(isValidTimeZone("Not/A-Time-Zone"), false);
});

test("does not invent a time in a daylight-saving gap", () => {
  assert.equal(
    getReminderTimes(
      taskAt("2026-03-08", "02:30", "At Due Time"),
      "America/Los_Angeles"
    ),
    null
  );
});
