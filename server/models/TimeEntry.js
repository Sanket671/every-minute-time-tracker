const mongoose = require("mongoose");

const TimeEntrySchema = new mongoose.Schema(
  {
    date: { type: String, required: true, index: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    durationMinutes: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

TimeEntrySchema.index({ date: 1, startTime: 1 }, { unique: true });

const TimeEntry =
  mongoose.models.TimeEntry || mongoose.model("TimeEntry", TimeEntrySchema);

module.exports = { TimeEntry };
