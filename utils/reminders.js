const REMINDER_LEAD_MINUTES = {
  "At Due Time": 0,
  "10 minutes before": 10,
  "30 minutes before": 30,
  "1 hour before": 60,
  "1 day before": 1440,
};

const isValidTimeZone = (timeZone) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

const getZonedParts = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce((values, part) => {
      if (part.type !== "literal") values[part.type] = Number(part.value);
      return values;
    }, {});
  return parts;
};

const getReminderTimes = (task, timeZone) => {
  const leadMinutes = REMINDER_LEAD_MINUTES[task.reminder];
  if (leadMinutes === undefined || !task.dueDate || !task.dueTime) return null;
  if (!isValidTimeZone(timeZone)) return null;

  const dueDate = new Date(task.dueDate);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(task.dueTime);
  if (Number.isNaN(dueDate.getTime()) || !timeMatch) return null;

  const year = dueDate.getUTCFullYear();
  const month = dueDate.getUTCMonth() + 1;
  const day = dueDate.getUTCDate();
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const localTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute);

  let dueAt = localTimeAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const zoned = getZonedParts(new Date(dueAt), timeZone);
    const representedAsUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute
    );
    dueAt = localTimeAsUtc - (representedAsUtc - dueAt);
  }

  const verified = getZonedParts(new Date(dueAt), timeZone);
  if (
    verified.year !== year ||
    verified.month !== month ||
    verified.day !== day ||
    verified.hour !== hour ||
    verified.minute !== minute
  ) {
    return null;
  }

  return {
    dueAt: new Date(dueAt),
    reminderAt: new Date(dueAt - leadMinutes * 60_000),
  };
};

module.exports = { getReminderTimes, isValidTimeZone };
