const CATEGORY_OPTIONS = [
  "Study",
  "Development",
  "DSA",
  "Classes",
  "Meeting",
  "Seva",
  "Meals",
  "Travel",
  "Rest",
  "Personal",
  "Sleep",
  "Other",
];

function parseTimeToMinutes(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatTimeFromMinutes(minutes) {
  const totalMinutes = Math.max(0, minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function formatMinutesAsDuration(totalMinutes) {
  const minutes = Math.max(0, Number(totalMinutes) || 0);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder}m`;
  }

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
}

function getDayWindowMinutes(config) {
  const startMinutes = parseTimeToMinutes(config.dayStart);
  const endMinutes = parseTimeToMinutes(config.dayEnd);
  if (startMinutes === null || endMinutes === null) {
    return 720;
  }
  return endMinutes - startMinutes;
}

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function getLatestEntryEndTime(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  return (
    [...entries]
      .sort(
        (a, b) => parseTimeToMinutes(a.endTime) - parseTimeToMinutes(b.endTime),
      )
      .at(-1)?.endTime || null
  );
}

function resolveNextSlot(entries, config, requestedEndTime) {
  const dayStart = config.dayStart || "08:00";
  const dayEnd = config.dayEnd || "20:00";
  const latestEndTime = getLatestEntryEndTime(entries) || dayStart;
  const openStartTime = latestEndTime;
  const endTime = requestedEndTime || dayEnd;
  const startMinutes = parseTimeToMinutes(openStartTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const durationMinutes =
    startMinutes !== null && endMinutes !== null
      ? Math.max(0, endMinutes - startMinutes)
      : 0;
  const isDayComplete = !!requestedEndTime && endTime === dayEnd;

  return {
    startTime: openStartTime,
    endTime,
    durationMinutes,
    nextStartTime: requestedEndTime
      ? isDayComplete
        ? dayEnd
        : endTime
      : openStartTime,
    dayEndTime: dayEnd,
    isDayComplete,
  };
}

function validateSlotRequest({
  date,
  endTime,
  title,
  category,
  existingEntries = [],
  config,
  isDayComplete = false,
}) {
  if (!date || !isValidDateString(date)) {
    return new Error("Invalid date.");
  }

  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  if (!trimmedTitle) {
    return new Error("Title is required.");
  }

  const dayStart = config.dayStart || "08:00";
  const dayEnd = config.dayEnd || "20:00";
  const startTime = getLatestEntryEndTime(existingEntries) || dayStart;
  const endMinutes = parseTimeToMinutes(endTime);
  const startMinutes = parseTimeToMinutes(startTime);

  if (endMinutes === null) {
    return new Error("Enter a valid end time.");
  }

  if (startMinutes === null) {
    return new Error("Current slot start time is invalid.");
  }

  if (endMinutes <= startMinutes) {
    return new Error(
      "End time must be later than the current slot start time.",
    );
  }

  if (endMinutes > parseTimeToMinutes(dayEnd)) {
    return new Error(`End time must be on or before the day end (${dayEnd}).`);
  }

  if (isDayComplete) {
    return new Error("Your day is already complete.");
  }

  if (category && !CATEGORY_OPTIONS.includes(category)) {
    return new Error("Invalid category.");
  }

  return null;
}

function buildDaySummary({ trackedMinutes, configuredDayMinutes }) {
  const totalTracked = Number(trackedMinutes) || 0;
  const configuredMinutes = Number(configuredDayMinutes) || 0;
  const remainingMinutes = Math.max(configuredMinutes - totalTracked, 0);
  const untrackedMinutes = Math.max(configuredMinutes - totalTracked, 0);
  const progressPercent =
    configuredMinutes > 0
      ? Number(((totalTracked / configuredMinutes) * 100).toFixed(2))
      : 0;

  return {
    trackedMinutes: totalTracked,
    configuredDayMinutes: configuredMinutes,
    remainingMinutes,
    untrackedMinutes,
    progressPercent,
  };
}

module.exports = {
  CATEGORY_OPTIONS,
  parseTimeToMinutes,
  formatTimeFromMinutes,
  formatMinutesAsDuration,
  getDayWindowMinutes,
  isValidDateString,
  getLatestEntryEndTime,
  resolveNextSlot,
  validateSlotRequest,
  buildDaySummary,
};
