const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { TimeEntry } = require("../models/TimeEntry");
const {
  parseTimeToMinutes,
  formatMinutesAsDuration,
  resolveNextSlot,
  validateSlotRequest,
  buildDaySummary,
  getDayWindowMinutes,
  getLatestEntryEndTime,
} = require("../services/timeService");

const config = { dayStart: "08:00", dayEnd: "20:00", timezone: "Asia/Kolkata" };

test("TimeEntry generates a valid MongoDB ObjectId", () => {
  const entry = new TimeEntry({
    date: "2026-10-05",
    startTime: "08:00",
    endTime: "09:00",
    durationMinutes: 60,
    title: "Breakfast",
    category: "Meals",
  });

  assert.ok(mongoose.isValidObjectId(entry._id));
  assert.equal(entry._id.constructor.name, "ObjectId");
  assert.equal(entry.validateSync(), undefined);
});

test("Fresh day uses configured day window", () => {
  const result = resolveNextSlot([], config);
  assert.equal(result.startTime, "08:00");
  assert.equal(result.nextStartTime, "08:00");
  assert.equal(result.dayEndTime, "20:00");
});

test("First slot starts at configured day start", () => {
  const result = resolveNextSlot([], config, "09:00");
  assert.equal(result.startTime, "08:00");
  assert.equal(result.endTime, "09:00");
  assert.equal(result.durationMinutes, 60);
});

test("Second slot chains from previous end", () => {
  const entries = [
    { startTime: "08:00", endTime: "09:00" },
    { startTime: "09:00", endTime: "10:30" },
  ];
  const result = resolveNextSlot(entries, config, "11:00");
  assert.equal(result.startTime, "10:30");
  assert.equal(result.endTime, "11:00");
  assert.equal(result.durationMinutes, 30);
});

test("Zero duration is rejected", () => {
  const error = validateSlotRequest({
    date: "2026-10-05",
    endTime: "08:00",
    title: "Breakfast",
    category: "Meals",
    existingEntries: [],
    config,
  });
  assert.ok(error);
  assert.match(error.message, /later than|after the current slot start/i);
});

test("Earlier end time is rejected", () => {
  const error = validateSlotRequest({
    date: "2026-10-05",
    endTime: "08:30",
    title: "Breakfast",
    category: "Meals",
    existingEntries: [{ startTime: "09:00", endTime: "10:00" }],
    config,
  });
  assert.ok(error);
  assert.match(error.message, /later than/i);
});

test("End beyond day end is rejected", () => {
  const error = validateSlotRequest({
    date: "2026-10-05",
    endTime: "20:30",
    title: "Workout",
    category: "Study",
    existingEntries: [],
    config,
  });
  assert.ok(error);
  assert.match(error.message, /day end/i);
});

test("Final entry at day end marks completion", () => {
  const entries = [{ startTime: "08:00", endTime: "19:00" }];
  const result = resolveNextSlot(entries, config, "20:00");
  assert.equal(result.startTime, "19:00");
  assert.equal(result.isDayComplete, true);
  assert.equal(result.nextStartTime, "20:00");
});

test("Title is required", () => {
  const error = validateSlotRequest({
    date: "2026-10-05",
    endTime: "09:00",
    title: "   ",
    category: "Meals",
    existingEntries: [],
    config,
  });
  assert.ok(error);
  assert.match(error.message, /title/i);
});

test("Invalid dates are rejected", () => {
  const error = validateSlotRequest({
    date: "bad-date",
    endTime: "09:00",
    title: "A",
    category: "Meals",
    existingEntries: [],
    config,
  });
  assert.ok(error);
  assert.match(error.message, /date/i);
});

test("Undo returns previous open slot", () => {
  const entries = [
    { startTime: "08:00", endTime: "09:00" },
    { startTime: "09:00", endTime: "10:00" },
  ];
  const result = getLatestEntryEndTime(entries);
  assert.equal(result, "10:00");
});

test("Duration formatter produces readable output", () => {
  assert.equal(formatMinutesAsDuration(60), "1h");
  assert.equal(formatMinutesAsDuration(75), "1h 15m");
  assert.equal(formatMinutesAsDuration(45), "45m");
});

test("Time parsing is consistent", () => {
  assert.equal(parseTimeToMinutes("08:00"), 480);
  assert.equal(parseTimeToMinutes("10:15"), 615);
});

test("Dashboard summary aggregates tracked and untracked time", () => {
  const summary = buildDaySummary({
    trackedMinutes: 660,
    configuredDayMinutes: 720,
  });
  assert.equal(summary.trackedMinutes, 660);
  assert.equal(summary.remainingMinutes, 60);
  assert.equal(summary.untrackedMinutes, 60);
  assert.equal(summary.progressPercent, 91.67);
});

test("Day window minutes are calculated accurately", () => {
  assert.equal(getDayWindowMinutes(config), 720);
});
