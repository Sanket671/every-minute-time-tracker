const express = require("express");
const path = require("path");
const fs = require("fs");
const config = require("./config/config");
const { connectDatabase, getDbStatus } = require("./config/db");
const { TimeEntry } = require("./models/TimeEntry");
const {
  CATEGORY_OPTIONS,
  parseTimeToMinutes,
  formatTimeFromMinutes,
  getLatestEntryEndTime,
  validateSlotRequest,
  resolveNextSlot,
  getDayWindowMinutes,
  buildDaySummary,
} = require("./services/timeService");

const app = express();
const memoryEntries = new Map();

function getDateString(date) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateWindow(fromDate, toDate) {
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  const results = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    results.push(getDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return results;
}

function getMemoryEntries(date) {
  return (memoryEntries.get(date) || [])
    .map((entry) => ({ ...entry }))
    .sort(
      (a, b) =>
        parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime),
    );
}

function writeMemoryEntries(date, entries) {
  memoryEntries.set(
    date,
    entries.map((entry) => ({ ...entry })),
  );
}

async function getEntriesForDate(date) {
  if (!date) {
    return [];
  }

  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    return (await TimeEntry.find({ date }).sort({ startTime: 1 }).lean()) || [];
  }

  return getMemoryEntries(date);
}

async function createEntry(entry) {
  if (getDbStatus().connected) {
    const created = await TimeEntry.create(entry);
    return created.toObject();
  }

  const current = getMemoryEntries(entry.date);
  current.push({ ...entry });
  current.sort(
    (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime),
  );
  writeMemoryEntries(entry.date, current);
  return { ...entry };
}

async function deleteLastEntryForDate(date) {
  if (getDbStatus().connected) {
    const latest = await TimeEntry.findOne({ date })
      .sort({ startTime: -1 })
      .lean();
    if (!latest) {
      return null;
    }
    await TimeEntry.deleteOne({ _id: latest._id });
    return latest;
  }

  const current = getMemoryEntries(date);
  if (current.length === 0) {
    return null;
  }
  const latest = current[current.length - 1];
  const remaining = current.slice(0, -1);
  writeMemoryEntries(date, remaining);
  return latest;
}

function validateDateRange(fromDate, toDate) {
  if (!fromDate || !toDate) {
    return null;
  }

  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return null;
  }

  return { from, to };
}

function ensureCategory(category) {
  return CATEGORY_OPTIONS.includes(category) ? category : "Other";
}

function hasDayCompleted(entries) {
  if (!entries.length) {
    return false;
  }

  const lastEntry = [...entries]
    .sort(
      (a, b) => parseTimeToMinutes(a.endTime) - parseTimeToMinutes(b.endTime),
    )
    .at(-1);
  return (
    parseTimeToMinutes(lastEntry.endTime) >= parseTimeToMinutes(config.dayEnd)
  );
}

app.use(express.json());

app.use((req, res, next) => {
  const providedKey = req.header("x-access-key") || req.query.accessKey || "";
  if (config.appAccessKey && providedKey !== config.appAccessKey) {
    return res
      .status(401)
      .json({ success: false, message: "Access key required." });
  }
  next();
});

app.get("/api/health", async (req, res) => {
  try {
    const dbState = getDbStatus();
    if (config.mongoUri && !dbState.connected) {
      await connectDatabase();
    }
    res.json({
      success: true,
      app: "healthy",
      database: getDbStatus(),
      timezone: config.timezone,
      dayStart: config.dayStart,
      dayEnd: config.dayEnd,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Health check failed." });
  }
});

app.get("/api/settings", (req, res) => {
  res.json({
    success: true,
    dayStart: config.dayStart,
    dayEnd: config.dayEnd,
    timezone: config.timezone,
    categories: CATEGORY_OPTIONS,
    totalMinutes: getDayWindowMinutes(config),
  });
});

app.get("/api/slots", async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "Date is required." });
  }

  const entries = await getEntriesForDate(date);
  return res.json({ success: true, entries });
});

app.post("/api/slots", async (req, res) => {
  const { date, endTime, title, category } = req.body || {};

  if (!date || typeof date !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "Date is required." });
  }

  const existingEntries = await getEntriesForDate(date);
  const dayComplete = hasDayCompleted(existingEntries);
  const validationError = validateSlotRequest({
    date,
    endTime,
    title,
    category,
    existingEntries,
    config,
    isDayComplete: dayComplete,
  });

  if (validationError) {
    return res
      .status(400)
      .json({ success: false, message: validationError.message });
  }

  const startTime = getLatestEntryEndTime(existingEntries) || config.dayStart;
  const durationMinutes =
    parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime);
  const trimmedTitle = String(title).trim();
  const safeCategory = ensureCategory(category || "Other");

  const newEntry = {
    date,
    startTime,
    endTime,
    durationMinutes,
    title: trimmedTitle,
    category: safeCategory,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const savedEntry = await createEntry(newEntry);
  const isDayComplete = endTime === config.dayEnd;

  return res.json({
    success: true,
    entry: savedEntry,
    nextStartTime: isDayComplete ? config.dayEnd : endTime,
    dayEndTime: config.dayEnd,
    isDayComplete,
  });
});

app.delete("/api/slots/last", async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "Date is required." });
  }

  const entries = await getEntriesForDate(date);
  if (!entries.length) {
    return res
      .status(404)
      .json({ success: false, message: "No entries found for this date." });
  }

  const deletedEntry = await deleteLastEntryForDate(date);
  const remainingEntries = await getEntriesForDate(date);

  return res.json({
    success: true,
    deletedEntry,
    nextStartTime: getLatestEntryEndTime(remainingEntries) || config.dayStart,
    dayEndTime: config.dayEnd,
  });
});

app.get("/api/dashboard", async (req, res) => {
  const fromDate = req.query.from || getDateString(new Date());
  const toDate = req.query.to || fromDate;
  const range = validateDateRange(fromDate, toDate);

  if (!range) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid date range." });
  }

  const allDates = getDateWindow(fromDate, toDate);
  const entries = [];
  for (const date of allDates) {
    entries.push(...(await getEntriesForDate(date)));
  }

  const totalTrackedMinutes = entries.reduce(
    (total, entry) => total + (Number(entry.durationMinutes) || 0),
    0,
  );
  const dayCounts = allDates.length || 1;
  const configuredDayMinutes = getDayWindowMinutes(config);
  const totalDayMinutes = configuredDayMinutes * dayCounts;
  const untrackedMinutes = Math.max(totalDayMinutes - totalTrackedMinutes, 0);

  const categoryTotals = {};
  const activityTotals = {};
  const dateTotals = {};

  for (const date of allDates) {
    const dayEntries = await getEntriesForDate(date);
    dateTotals[date] = dayEntries.reduce(
      (total, entry) => total + (Number(entry.durationMinutes) || 0),
      0,
    );
  }

  for (const entry of entries) {
    categoryTotals[entry.category] =
      (categoryTotals[entry.category] || 0) +
      (Number(entry.durationMinutes) || 0);
    activityTotals[entry.title] =
      (activityTotals[entry.title] || 0) + (Number(entry.durationMinutes) || 0);
  }

  const sortedCategories = Object.entries(categoryTotals).sort(
    ([, a], [, b]) => b - a,
  );
  const mostUsedCategory = sortedCategories.length
    ? sortedCategories[0][0]
    : "None";
  const topActivities = Object.entries(activityTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([title, duration]) => ({ title, duration }));

  const averageEntryDuration = entries.length
    ? Math.round(totalTrackedMinutes / entries.length)
    : 0;

  return res.json({
    success: true,
    fromDate,
    toDate,
    totalTrackedMinutes,
    totalDayMinutes,
    untrackedMinutes,
    averageEntryDuration,
    numberOfEntries: entries.length,
    mostUsedCategory,
    categoryTotals,
    dateTotals,
    topActivities,
    summary: buildDaySummary({
      trackedMinutes: totalTrackedMinutes,
      configuredDayMinutes: totalDayMinutes,
    }),
  });
});

const distPath = path.join(__dirname, "../client/dist");

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    return res.sendFile(path.join(distPath, "index.html"));
  });
}

(async () => {
  await connectDatabase();
  app.listen(config.port, () => {
    console.log(
      `Every Minute tracker running on http://localhost:${config.port}`,
    );
  });
})();

module.exports = {
  app,
  getEntriesForDate,
  createEntry,
  deleteLastEntryForDate,
};
