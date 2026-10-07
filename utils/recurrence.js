const getNextDueDate = (dueDate, recurrence) => {
  if (dueDate === null || dueDate === undefined || dueDate === "") return null;
  const nextDueDate = new Date(dueDate);
  if (Number.isNaN(nextDueDate.getTime())) return null;

  if (recurrence === "Daily") {
    nextDueDate.setUTCDate(nextDueDate.getUTCDate() + 1);
    return Number.isNaN(nextDueDate.getTime()) ? null : nextDueDate;
  }

  if (recurrence === "Weekly") {
    nextDueDate.setUTCDate(nextDueDate.getUTCDate() + 7);
    return Number.isNaN(nextDueDate.getTime()) ? null : nextDueDate;
  }

  if (recurrence === "Monthly") {
    const dayOfMonth = nextDueDate.getUTCDate();
    const nextMonth = new Date(
      Date.UTC(
        nextDueDate.getUTCFullYear(),
        nextDueDate.getUTCMonth() + 1,
        1,
        nextDueDate.getUTCHours(),
        nextDueDate.getUTCMinutes(),
        nextDueDate.getUTCSeconds(),
        nextDueDate.getUTCMilliseconds()
      )
    );
    if (Number.isNaN(nextMonth.getTime())) return null;
    const daysInNextMonth = new Date(
      Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)
    ).getUTCDate();
    nextMonth.setUTCDate(Math.min(dayOfMonth, daysInNextMonth));
    return Number.isNaN(nextMonth.getTime()) ? null : nextMonth;
  }

  return null;
};

module.exports = { getNextDueDate };
