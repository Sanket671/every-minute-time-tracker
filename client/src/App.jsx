import { useEffect, useMemo, useState } from "react";

const defaultForm = { title: "", category: "Study", endTime: "" };

function getLocalDateString(date) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(totalMinutes) {
  if (totalMinutes <= 0) {
    return "0m";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) {
    return `${hours}h ${minutes}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function formatClock(date) {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
}

function formatDateLabel(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getAccessKey() {
  const keyFromQuery = new URLSearchParams(window.location.search).get(
    "accessKey",
  );
  if (keyFromQuery) {
    return keyFromQuery;
  }
  return localStorage.getItem("every-minute-access-key") || "";
}

function apiFetch(url, options = {}) {
  const accessKey = getAccessKey();
  const headers = { ...(options.headers || {}) };

  if (accessKey) {
    headers["x-access-key"] = accessKey;
  }

  return fetch(url, { ...options, headers });
}

function App() {
  const today = getLocalDateString(new Date());
  const [settings, setSettings] = useState(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [status, setStatus] = useState({ type: "", text: "" });
  const [dashboard, setDashboard] = useState(null);
  const [route, setRoute] = useState(window.location.pathname);
  const [clock, setClock] = useState(new Date());
  const [dashboardRange, setDashboardRange] = useState({
    from: today,
    to: today,
  });

  const navigate = (nextPath) => {
    window.history.pushState({}, "", nextPath);
    setRoute(window.location.pathname);
  };

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchSettings() {
      const response = await apiFetch("/api/settings");
      const data = await response.json();
      if (data.success) {
        setSettings(data);
        setForm((prev) => ({
          ...prev,
          category: prev.category || data.categories[0],
          endTime: data.dayEnd,
        }));
      }
    }
    fetchSettings();
  }, []);

  const loadEntries = async (date) => {
    const response = await apiFetch(`/api/slots?date=${date}`);
    const data = await response.json();
    if (data.success) {
      setEntries(data.entries || []);
    }
  };

  useEffect(() => {
    if (!settings) {
      return;
    }
    loadEntries(selectedDate);
  }, [selectedDate, settings]);

  const loadDashboard = async () => {
    const query = `?from=${dashboardRange.from}&to=${dashboardRange.to}`;
    const response = await apiFetch(`/api/dashboard${query}`);
    const data = await response.json();
    if (data.success) {
      setDashboard(data);
    }
  };

  useEffect(() => {
    if (route === "/dashboard" && settings) {
      loadDashboard();
    }
  }, [route, dashboardRange, settings]);

  const trackedMinutes = useMemo(
    () =>
      entries.reduce(
        (sum, entry) => sum + (Number(entry.durationMinutes) || 0),
        0,
      ),
    [entries],
  );

  const openSlot = useMemo(() => {
    if (!settings) {
      return { startTime: "", endTime: "" };
    }

    const latest = entries.length ? entries[entries.length - 1] : null;
    const start = latest ? latest.endTime : settings.dayStart;
    return {
      startTime: start,
      endTime: settings.dayEnd,
      isDayComplete: !!latest && latest.endTime === settings.dayEnd,
    };
  }, [entries, settings]);

  const totalDayMinutes = settings ? Number(settings.totalMinutes) || 720 : 720;
  const remainingMinutes = Math.max(totalDayMinutes - trackedMinutes, 0);
  const progressPercent = totalDayMinutes
    ? Math.min((trackedMinutes / totalDayMinutes) * 100, 100)
    : 0;

  async function handleSave(event) {
    event.preventDefault();
    if (!settings) {
      return;
    }

    const payload = {
      date: selectedDate,
      endTime: form.endTime,
      title: form.title,
      category: form.category,
    };

    const response = await apiFetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      setStatus({
        type: "error",
        text: data.message || "Could not save this slot. Please try again.",
      });
      return;
    }

    setEntries((previous) =>
      [...previous, data.entry].sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      ),
    );
    setForm({
      title: "",
      category: form.category,
      endTime: settings.dayEnd,
    });
    setStatus({ type: "success", text: "Saved ✓" });
    if (!data.isDayComplete) {
      setTimeout(() => setStatus({ type: "", text: "" }), 1500);
    }
  }

  async function handleUndo() {
    const response = await apiFetch(`/api/slots/last?date=${selectedDate}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      setStatus({
        type: "error",
        text: data.message || "Could not undo the last entry.",
      });
      return;
    }

    await loadEntries(selectedDate);
    setForm((prev) => ({
      ...prev,
      title: "",
      endTime: settings?.dayEnd || "",
    }));
    setStatus({ type: "success", text: "Last entry removed." });
  }

  useEffect(() => {
    setDashboardRange((previous) => ({
      ...previous,
      from: selectedDate,
      to: selectedDate,
    }));
  }, [selectedDate]);

  const isFormDisabled = openSlot.isDayComplete || !settings;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">EVERY MINUTE</p>
          <h1>Where did your time go today?</h1>
        </div>
        <div className="header-actions">
          <button
            className={route === "/" ? "tab active" : "tab"}
            onClick={() => navigate("/")}
          >
            Today
          </button>
          <button
            className={route === "/dashboard" ? "tab active" : "tab"}
            onClick={() => navigate("/dashboard")}
          >
            Dashboard
          </button>
        </div>
      </header>

      {route === "/dashboard" ? (
        <main className="dashboard-page">
          <section className="card dashboard-head">
            <div>
              <p className="eyebrow">DASHBOARD</p>
              <h2>Where did my time actually go?</h2>
            </div>
            <div className="range-controls">
              <label>
                From
                <input
                  type="date"
                  value={dashboardRange.from}
                  onChange={(event) =>
                    setDashboardRange((previous) => ({
                      ...previous,
                      from: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={dashboardRange.to}
                  onChange={(event) =>
                    setDashboardRange((previous) => ({
                      ...previous,
                      to: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </section>

          {dashboard ? (
            <>
              <section className="stats-grid">
                <div className="stat-card">
                  <span>Total tracked</span>
                  <strong>
                    {formatDuration(dashboard.totalTrackedMinutes)}
                  </strong>
                </div>
                <div className="stat-card">
                  <span>Entries</span>
                  <strong>{dashboard.numberOfEntries}</strong>
                </div>
                <div className="stat-card">
                  <span>Untracked</span>
                  <strong>{formatDuration(dashboard.untrackedMinutes)}</strong>
                </div>
                <div className="stat-card">
                  <span>Average</span>
                  <strong>
                    {formatDuration(dashboard.averageEntryDuration)}
                  </strong>
                </div>
              </section>

              <section className="grid-two">
                <div className="card">
                  <h3>Category breakdown</h3>
                  {Object.entries(dashboard.categoryTotals || {}).map(
                    ([category, minutes]) => (
                      <div className="metric-row" key={category}>
                        <span>{category}</span>
                        <div className="bar-shell">
                          <span
                            className="bar-fill"
                            style={{
                              width: `${(minutes / Math.max(dashboard.totalTrackedMinutes, 1)) * 100}%`,
                            }}
                          />
                        </div>
                        <strong>{formatDuration(minutes)}</strong>
                      </div>
                    ),
                  )}
                </div>

                <div className="card">
                  <h3>Top activities</h3>
                  <ul className="plain-list">
                    {(dashboard.topActivities || []).map(
                      ({ title, duration }) => (
                        <li key={title}>
                          <span>{title}</span>
                          <strong>{formatDuration(duration)}</strong>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              </section>
            </>
          ) : (
            <p className="muted">Loading dashboard…</p>
          )}
        </main>
      ) : (
        <main className="tracker-page">
          <section className="date-row card">
            <div>
              <span className="tiny-label">Today</span>
              <strong>{formatDateLabel(selectedDate)}</strong>
            </div>
            <div className="clock-wrap">
              <span className="tiny-label">IST</span>
              <strong>{formatClock(clock)}</strong>
            </div>
            <label className="date-picker">
              <span className="tiny-label">Date</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </label>
          </section>

          <section className="metrics-grid">
            <div className="metric-card">
              <span>Tracked</span>
              <strong>{formatDuration(trackedMinutes)}</strong>
            </div>
            <div className="metric-card">
              <span>Remaining</span>
              <strong>{formatDuration(remainingMinutes)}</strong>
            </div>
          </section>

          <div className="progress-wrap card">
            <div className="progress-meta">
              <span>{Math.round(progressPercent)}% complete</span>
              <span>
                {formatDuration(trackedMinutes)} /{" "}
                {formatDuration(totalDayMinutes)}
              </span>
            </div>
            <div className="progress-bar">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <section className="card slot-form-card">
            {openSlot.isDayComplete ? (
              <div className="completion-banner">
                <h3>DAY COMPLETE 🎉</h3>
                <p>You accounted for the full tracked period.</p>
              </div>
            ) : (
              <form onSubmit={handleSave}>
                <div className="slot-header-column">
                  <div>
                    <p className="tiny-label">Current slot</p>
                    <h3>
                      {openSlot.startTime} → {openSlot.endTime}
                    </h3>
                  </div>
                </div>

                <label>
                  <span>What did you do?</span>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        title: event.target.value,
                      }))
                    }
                    placeholder="What did you do?"
                    disabled={isFormDisabled}
                  />
                </label>

                <div className="two-col-fields">
                  <label>
                    <span>Category</span>
                    <select
                      value={form.category}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          category: event.target.value,
                        }))
                      }
                      disabled={isFormDisabled}
                    >
                      {(settings?.categories || []).map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>End time</span>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          endTime: event.target.value,
                        }))
                      }
                      disabled={isFormDisabled}
                    />
                  </label>
                </div>

                <div className="form-actions">
                  <button type="submit" disabled={isFormDisabled}>
                    Save slot
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleUndo}
                  >
                    Undo last entry
                  </button>
                </div>
              </form>
            )}

            {status.text ? (
              <p className={`form-status ${status.type}`}>{status.text}</p>
            ) : null}
          </section>

          <section className="card timeline-card">
            <div className="timeline-header">
              <h3>Today</h3>
            </div>
            {entries.length ? (
              <div className="timeline-list">
                {entries.map((entry) => (
                  <div
                    key={entry._id || `${entry.date}-${entry.startTime}`}
                    className="timeline-item"
                  >
                    <div className="slot-time">
                      {entry.startTime} – {entry.endTime}
                    </div>
                    <div className="slot-summary">
                      <strong>{entry.title}</strong>
                      <span>{entry.category}</span>
                    </div>
                    <div className="slot-duration">
                      {formatDuration(entry.durationMinutes)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No completed entries yet for this day.</p>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
