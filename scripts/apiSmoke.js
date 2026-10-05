const date = "2026-10-05";
const base = "http://localhost:5000";

async function request(path, options = {}) {
  const res = await fetch(base + path, options);
  const text = await res.text();

  try {
    const json = JSON.parse(text);
    console.log(path, res.status, JSON.stringify(json));
    return json;
  } catch (error) {
    console.log(path, res.status, text);
    return null;
  }
}

(async () => {
  await request("/api/slots?date=" + date);

  await request("/api/slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date,
      endTime: "09:00",
      title: "Breakfast",
      category: "Meals",
    }),
  });

  await request("/api/slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date,
      endTime: "10:30",
      title: "DSA Practice",
      category: "DSA",
    }),
  });

  const slots = await request("/api/slots?date=" + date);
  console.log("slot-count", slots.entries.length);

  await request("/api/dashboard?from=" + date + "&to=" + date);
  await request("/api/slots/last?date=" + date, { method: "DELETE" });

  const finalSlots = await request("/api/slots?date=" + date);
  console.log("remaining", finalSlots.entries.length);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
