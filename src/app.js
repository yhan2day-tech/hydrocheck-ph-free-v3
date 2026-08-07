import {
  CROP_PRESETS,
  SYMPTOMS,
  buildTrendSummary,
  buildDiagnosisRequest,
  calculateEc,
  clone,
  createDefaultState,
  csvColumns,
  evaluateLog,
  exportableRows,
  latestLogForSetup,
  mergeState,
  number,
  normalizeHarvestSchedule,
  parseSensorCsv,
  readingDueSetups,
  rowsToCsv,
  setupStatus,
  summarizeHarvestSchedule,
  todayISO,
  uid
} from "./core.js?v=3.2.0";
import { clearState, loadState, saveState } from "./storage.js?v=3.2.0";

const VIEWS = [
  ["dashboard", "Dashboard"],
  ["setups", "Setups"],
  ["log", "Weekly Log"],
  ["recommendations", "Actions"],
  ["sensors", "Sensors"],
  ["history", "History"],
  ["sync", "Sync"]
];

const HARVEST_STORAGE_KEYS = ["harvest-tracker-entries-v2", "harvestEntries"];
const HARVEST_TRACKER_URL = "https://yhan2day-tech.github.io/harvest-tracker/";

const app = document.querySelector("#app");
const nav = document.querySelector("#nav");
const installButton = document.querySelector("#install-button");
let state = createDefaultState();
let activeView = "dashboard";
let selectedSetupId = "";
let editingSetupId = "";
let dashboardWeeks = 8;
let harvestSchedule = [];
let draftSensor = null;
let deferredInstallPrompt = null;

boot();

async function boot() {
  state = await loadState(createDefaultState(), mergeState);
  if (!state.setups.length) state = createDefaultState();
  selectedSetupId = state.setups[0]?.id || "";
  editingSetupId = selectedSetupId;
  harvestSchedule = loadHarvestSchedule();
  refreshSavedRecommendations();
  renderNav();
  render();
  bindGlobalEvents();
  registerServiceWorker();
  checkDueReminders();
}

function refreshSavedRecommendations() {
  state.logs = state.logs.map((log) => {
    if (log.recommendations?.length) return log;
    const setup = setupById(log.setupId);
    return { ...log, recommendations: evaluateLog(setup, log).recommendations };
  });
}

function bindGlobalEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("change", handleChange);
  window.addEventListener("storage", (event) => {
    if (!HARVEST_STORAGE_KEYS.includes(event.key)) return;
    harvestSchedule = loadHarvestSchedule();
    if (activeView === "dashboard") render();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });
}

function renderNav() {
  nav.innerHTML = VIEWS.map(
    ([id, label]) => `<button class="nav-tab ${activeView === id ? "active" : ""}" data-view="${id}" type="button">${label}</button>`
  ).join("");
}

function render() {
  renderNav();
  const renderers = {
    dashboard: renderDashboard,
    setups: renderSetups,
    log: renderWeeklyLog,
    recommendations: renderRecommendations,
    sensors: renderSensors,
    history: renderHistory,
    sync: renderSync
  };
  app.innerHTML = renderers[activeView]();
}

function handleClick(event) {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    activeView = viewButton.dataset.view;
    render();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  const id = actionButton.dataset.id;

  if (action === "seed-demo") seedDemo();
  if (action === "edit-setup") {
    editingSetupId = id;
    selectedSetupId = id;
    activeView = "setups";
    render();
  }
  if (action === "new-setup") {
    editingSetupId = "";
    activeView = "setups";
    render();
  }
  if (action === "open-log") {
    selectedSetupId = id;
    activeView = "log";
    render();
  }
  if (action === "open-actions") {
    selectedSetupId = id;
    activeView = "recommendations";
    render();
  }
  if (action === "open-harvest") window.location.href = HARVEST_TRACKER_URL;
  if (action === "delete-log") deleteLog(id);
  if (action === "use-sensor") useSensorAsDraft(id);
  if (action === "delete-sensor") deleteSensor(id);
  if (action === "share-diagnosis") shareDiagnosis(id);
  if (action === "export-backup") exportBackup();
  if (action === "share-backup") shareBackup();
  if (action === "export-csv") exportCsv(actionButton.dataset.kind);
  if (action === "request-notifications") requestNotifications();
  if (action === "clear-data") clearAllData();
}

async function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const formId = form.getAttribute("id");

  if (formId === "setup-form") await saveSetup(form);
  if (formId === "weekly-log-form") await saveWeeklyLog(form);
  if (formId === "sensor-form") await saveSensor(form);
  if (formId === "sensor-import-form") await importSensors(form);
  if (formId === "reminder-form") await saveReminder(form);
}

async function handleChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.matches("[data-select-setup]")) {
    selectedSetupId = target.value;
    if (activeView === "setups") editingSetupId = target.value;
    render();
  }

  if (target.matches("[data-dashboard-setup]")) {
    selectedSetupId = target.value;
    render();
  }

  if (target.matches("[data-dashboard-weeks]")) {
    dashboardWeeks = Number(target.value) || 8;
    render();
  }

  if (target.id === "restore-file") {
    await importBackup(target.files?.[0]);
  }
}

function setupById(id) {
  return state.setups.find((setup) => setup.id === id);
}

function selectedSetup() {
  return setupById(selectedSetupId) || state.setups[0];
}

function setupOptions(selectedId = selectedSetupId) {
  return state.setups.map((setup) => `<option value="${setup.id}" ${setup.id === selectedId ? "selected" : ""}>${escapeHtml(setup.name)}</option>`).join("");
}

function renderDashboard() {
  const setup = selectedSetup();
  const setupLogs = state.logs.filter((log) => log.setupId === setup.id);
  const dueReadings = readingDueSetups(state.setups, state.logs);
  const harvest = summarizeHarvestSchedule(harvestSchedule);
  const needsAction = state.setups.filter((item) => {
    const latest = latestLogForSetup(state.logs, item.id);
    return latest && ["Warning", "Critical"].includes(evaluateLog(item, latest).severity);
  });
  const actions = dashboardActions(dueReadings, harvest);
  const latestDate = [...state.logs].map((log) => log.date).filter(Boolean).sort().at(-1);

  return `
    <section class="dashboard-controls" aria-label="Dashboard filters">
      <label>Setup<select data-dashboard-setup>${setupOptions(setup.id)}</select></label>
      <label>Trend period
        <select data-dashboard-weeks>
          ${[4, 8, 12].map((weeks) => `<option value="${weeks}" ${weeks === dashboardWeeks ? "selected" : ""}>${weeks} weeks</option>`).join("")}
        </select>
      </label>
    </section>

    <section class="status-strip" aria-label="Weekly operating status">
      ${statusMetric("Needs action", needsAction.length, needsAction.some((item) => evaluateLog(item, latestLogForSetup(state.logs, item.id)).severity === "Critical") ? "critical" : needsAction.length ? "warning" : "good", `${state.setups.length} setups checked`)}
      ${statusMetric("Readings due", dueReadings.length, dueReadings.length ? "warning" : "good", "Weekly check every 7 days")}
      ${statusMetric("Harvests next 7 days", harvest.dueToday.length + harvest.nextSevenDays.length, harvest.dueToday.length ? "warning" : "good", harvest.overdue.length ? `${harvest.overdue.length} overdue` : "No overdue schedule")}
    </section>

    <section class="dashboard-section-head">
      <div>
        <h2>Weekly trends</h2>
        <p>${escapeHtml(setup.crop)} / ${escapeHtml(setup.name)} / ${dashboardWeeks} weeks</p>
      </div>
      <button class="btn small" data-action="open-log" data-id="${setup.id}" type="button">Add reading</button>
    </section>
    <section class="trend-dashboard-grid">
      ${dashboardTrendCard(setupLogs, "ph", "pH", "", setup.targetPhMin, setup.targetPhMax, 2)}
      ${dashboardTrendCard(setupLogs, "ec", "EC", "mS/cm", setup.targetEcMin, setup.targetEcMax, 2)}
      ${dashboardTrendCard(setupLogs, "waterTempC", "Water temp", "C", setup.targetWaterTempMin, setup.targetWaterTempMax, 1)}
    </section>

    <section class="operating-panel">
      <div class="dashboard-section-head compact">
        <div>
          <h2>Priority crop actions</h2>
          <p>Highest-risk work first</p>
        </div>
        <button class="btn small ghost" data-action="open-actions" data-id="${setup.id}" type="button">All actions</button>
      </div>
      <div class="operation-list">${actions.length ? actions.slice(0, 6).map(renderDashboardAction).join("") : `<div class="empty compact">No urgent action from the latest readings or harvest schedule.</div>`}</div>
    </section>

    <section class="operating-panel harvest-panel">
      <div class="dashboard-section-head compact">
        <div>
          <h2>Harvest outlook</h2>
          <p>Expected dates from the separate Harvest Tracker app</p>
        </div>
        <button class="btn small" data-action="open-harvest" type="button">Open tracker</button>
      </div>
      ${harvestSchedule.length ? `
        ${harvestLoadBars(harvest.scheduled)}
        <div class="harvest-columns">
          ${harvestGroup("Overdue", harvest.overdue, "None overdue", "critical")}
          ${harvestGroup("Due today", harvest.dueToday, "None today", "warning")}
          ${harvestGroup("Next 7 days", harvest.nextSevenDays, "None scheduled", "good")}
        </div>
      ` : `<div class="empty harvest-empty">No Harvest Tracker dates found in this browser. Open Harvest Tracker and add transplants; they will appear here automatically.</div>`}
    </section>

    <p class="dashboard-freshness">Readings through ${latestDate ? formatDashboardDate(latestDate) : "no saved date"}. Data stays on this device; Harvest Tracker remains a separate app.</p>
  `;
}

function statusMetric(label, value, tone, detail) {
  return `<div class="status-metric ${tone}"><strong>${value}</strong><span>${escapeHtml(label)}</span><small>${escapeHtml(detail)}</small></div>`;
}

function dashboardTrendCard(logs, field, label, unit, targetMin, targetMax, digits) {
  const trend = buildTrendSummary(logs, field, targetMin, targetMax, dashboardWeeks);
  const delta = trend.delta === null ? "No prior reading" : `${trend.delta > 0 ? "+" : ""}${number(trend.delta, digits)} since last`;
  const statusLabel = trend.targetStatus === "good" ? "In target" : trend.targetStatus === "low" ? "Below target" : trend.targetStatus === "high" ? "Above target" : "No reading";
  return `
    <article class="trend-panel status-${trend.targetStatus}">
      <div class="trend-heading">
        <div><h3>${escapeHtml(label)}</h3><small>Target ${number(targetMin, digits)}-${number(targetMax, digits)}${unit ? ` ${escapeHtml(unit)}` : ""}</small></div>
        <div class="trend-latest"><strong>${trend.latest === null ? "-" : number(trend.latest, digits)}</strong><small>${escapeHtml(unit)}</small></div>
      </div>
      ${trend.points.length >= 2 ? trendChartSvg(trend.points, targetMin, targetMax, label, digits) : `<div class="trend-empty">Add another weekly reading to show movement.</div>`}
      <div class="trend-foot"><span class="target-state ${trend.targetStatus}">${statusLabel}</span><span>${escapeHtml(delta)} / ${trend.points.length} records</span></div>
    </article>
  `;
}

function trendChartSvg(points, targetMin, targetMax, label, digits) {
  const width = 360;
  const height = 150;
  const padX = 34;
  const padY = 18;
  const values = points.map((point) => point.value);
  const low = Math.min(...values, Number(targetMin));
  const high = Math.max(...values, Number(targetMax));
  const padding = Math.max((high - low) * 0.18, label === "pH" ? 0.2 : 0.5);
  const min = low - padding;
  const max = high + padding;
  const range = max - min || 1;
  const x = (index) => padX + (index / Math.max(1, points.length - 1)) * (width - padX * 2);
  const y = (value) => height - padY - ((value - min) / range) * (height - padY * 2);
  const targetTop = y(Number(targetMax));
  const targetBottom = y(Number(targetMin));
  const polyline = points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const firstDate = formatDashboardDate(points[0].date, { month: "short", day: "numeric" });
  const lastDate = formatDashboardDate(points.at(-1).date, { month: "short", day: "numeric" });
  return `
    <svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(label)} trend from ${escapeAttr(firstDate)} to ${escapeAttr(lastDate)}">
      <rect class="target-band" x="${padX}" y="${targetTop}" width="${width - padX * 2}" height="${Math.max(2, targetBottom - targetTop)}" />
      ${[0, 0.5, 1].map((ratio) => {
        const lineY = padY + ratio * (height - padY * 2);
        const lineValue = max - ratio * range;
        return `<line class="chart-grid-line" x1="${padX}" y1="${lineY}" x2="${width - padX}" y2="${lineY}" /><text x="2" y="${lineY + 4}">${number(lineValue, digits)}</text>`;
      }).join("")}
      <line class="target-line" x1="${padX}" y1="${targetTop}" x2="${width - padX}" y2="${targetTop}" />
      <line class="target-line" x1="${padX}" y1="${targetBottom}" x2="${width - padX}" y2="${targetBottom}" />
      <polyline class="trend-line" points="${polyline}" />
      ${points.map((point, index) => `<circle class="trend-point" cx="${x(index)}" cy="${y(point.value)}" r="3.5"><title>${escapeHtml(formatDashboardDate(point.date))}: ${number(point.value, digits)}</title></circle>`).join("")}
      <text class="date-label" x="${padX}" y="${height - 1}">${escapeHtml(firstDate)}</text>
      <text class="date-label end" x="${width - padX}" y="${height - 1}">${escapeHtml(lastDate)}</text>
    </svg>
  `;
}

function dashboardActions(dueReadings, harvest) {
  const score = { Critical: 3, Warning: 2, Watch: 1, Good: 0 };
  const actions = [];
  for (const setup of state.setups) {
    const latest = latestLogForSetup(state.logs, setup.id);
    if (latest) {
      const recommendations = evaluateLog(setup, latest).recommendations;
      recommendations.filter((item) => item.severity !== "Good").slice(0, 2).forEach((item) => actions.push({
        severity: item.severity,
        title: item.issue,
        context: `${setup.crop} / ${setup.name}`,
        detail: item.recommendedAction,
        action: "open-actions",
        setupId: setup.id,
        button: "Review"
      }));
    }
  }
  dueReadings.forEach(({ setup, ageDays }) => actions.push({
    severity: "Watch",
    title: ageDays === null ? "First weekly reading is due" : `Weekly reading is ${Math.max(0, ageDays - 6)} day${ageDays - 6 === 1 ? "" : "s"} overdue`,
    context: `${setup.crop} / ${setup.name}`,
    detail: "Record pH, EC, and reservoir temperature before making nutrient changes.",
    action: "open-log",
    setupId: setup.id,
    button: "Log now"
  }));
  [...harvest.overdue, ...harvest.dueToday].forEach((entry) => actions.push({
    severity: entry.daysLeft < 0 ? "Critical" : "Warning",
    title: entry.daysLeft < 0 ? "Harvest date overdue" : "Harvest due today",
    context: `${entry.greenhouseName} / ${entry.row}`,
    detail: `Expected harvest ${formatDashboardDate(entry.harvestDate)}. Inspect crop readiness and update the separate Harvest Tracker schedule.`,
    action: "open-harvest",
    setupId: "",
    button: "Open tracker"
  }));
  return actions.sort((a, b) => score[b.severity] - score[a.severity] || a.context.localeCompare(b.context));
}

function renderDashboardAction(item) {
  return `
    <article class="operation-row">
      <span class="badge ${item.severity.toLowerCase()}">${escapeHtml(item.severity)}</span>
      <div class="operation-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.context)}</small><p>${escapeHtml(item.detail)}</p></div>
      <button class="btn small ${item.severity === "Critical" ? "primary" : "ghost"}" data-action="${item.action}" ${item.setupId ? `data-id="${escapeAttr(item.setupId)}"` : ""} type="button">${escapeHtml(item.button)}</button>
    </article>
  `;
}

function harvestLoadBars(entries) {
  const today = new Date();
  const buckets = [0, 1, 2, 3].map((week) => {
    const start = new Date(today);
    start.setDate(start.getDate() + week * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const count = entries.filter((entry) => entry.daysLeft >= week * 7 && entry.daysLeft <= week * 7 + 6).length;
    return { label: week === 0 ? "This week" : formatDashboardDate(todayISO(start), { month: "short", day: "numeric" }), count };
  });
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return `<div class="harvest-load" aria-label="Expected harvest load for four weeks">${buckets.map((bucket) => `<div><span>${escapeHtml(bucket.label)}</span><i style="--bar:${Math.max(4, (bucket.count / max) * 100)}%"></i><strong>${bucket.count}</strong></div>`).join("")}</div>`;
}

function harvestGroup(title, entries, emptyText, tone) {
  return `
    <div class="harvest-group ${tone}">
      <div class="harvest-group-head"><h3>${escapeHtml(title)}</h3><strong>${entries.length}</strong></div>
      ${entries.slice(0, 3).map((entry) => `<div class="harvest-item"><b>${escapeHtml(entry.greenhouseName)} / ${escapeHtml(entry.row)}</b><span>${formatDashboardDate(entry.harvestDate)}${entry.daysLeft > 0 ? ` / ${entry.daysLeft} day${entry.daysLeft === 1 ? "" : "s"}` : entry.daysLeft < 0 ? ` / ${Math.abs(entry.daysLeft)} day${entry.daysLeft === -1 ? "" : "s"} late` : ""}</span></div>`).join("") || `<p class="harvest-none">${escapeHtml(emptyText)}</p>`}
    </div>
  `;
}

function formatDashboardDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!parts) return String(value || "-");
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])).toLocaleDateString("en-US", options);
}

function loadHarvestSchedule() {
  for (const key of HARVEST_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return normalizeHarvestSchedule(JSON.parse(raw));
    } catch {
      // A broken legacy value should not stop HydroCheck from loading.
    }
  }
  return [];
}

function renderSetups() {
  const setup = editingSetupId ? setupById(editingSetupId) : null;
  const preset = CROP_PRESETS[setup?.crop || "Lettuce"];
  const formSetup = setup || {
    id: "",
    name: "",
    crop: "Lettuce",
    variety: "",
    systemType: "NFT",
    tankCapacityLiters: 100,
    normalWaterVolumeLiters: 80,
    tdsScale: 500,
    ...preset,
    nutrientFormula: "",
    pumpSchedule: "",
    location: "Bohol",
    notes: ""
  };

  const list = state.setups.map((item) => {
    const status = setupStatus(item, state.logs);
    return `
      <button class="list-row ${editingSetupId === item.id ? "selected" : ""}" data-action="edit-setup" data-id="${item.id}" type="button">
        <span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.crop)} / ${escapeHtml(item.systemType)}</small></span>
        <span class="badge ${status.severity.toLowerCase()}">${status.severity}</span>
      </button>
    `;
  }).join("");

  return `
    <section class="two-column">
      <div class="panel">
        <div class="section-head compact">
          <h2>Setups</h2>
          <button class="btn small" data-action="new-setup" type="button">Add</button>
        </div>
        <div class="list-stack">${list}</div>
      </div>
      <form class="panel form-grid" id="setup-form">
        <input type="hidden" name="id" value="${escapeAttr(formSetup.id)}" />
        <label>Name<input name="name" required value="${escapeAttr(formSetup.name)}" /></label>
        <label>Crop
          <select name="crop">
            ${Object.keys(CROP_PRESETS).map((crop) => `<option ${crop === formSetup.crop ? "selected" : ""}>${crop}</option>`).join("")}
          </select>
        </label>
        <label>Variety<input name="variety" value="${escapeAttr(formSetup.variety)}" /></label>
        <label>System Type<input name="systemType" required value="${escapeAttr(formSetup.systemType)}" /></label>
        <label>Tank Capacity L<input name="tankCapacityLiters" type="number" min="1" step="1" value="${formSetup.tankCapacityLiters}" /></label>
        <label>Normal Volume L<input name="normalWaterVolumeLiters" type="number" min="1" step="1" value="${formSetup.normalWaterVolumeLiters}" /></label>
        <label>TDS Scale
          <select name="tdsScale">
            <option value="500" ${Number(formSetup.tdsScale) === 500 ? "selected" : ""}>500 scale</option>
            <option value="700" ${Number(formSetup.tdsScale) === 700 ? "selected" : ""}>700 scale</option>
            <option value="" ${!formSetup.tdsScale ? "selected" : ""}>Unknown</option>
          </select>
        </label>
        <label>pH Min<input name="targetPhMin" type="number" step="0.1" value="${formSetup.targetPhMin}" /></label>
        <label>pH Max<input name="targetPhMax" type="number" step="0.1" value="${formSetup.targetPhMax}" /></label>
        <label>EC Min<input name="targetEcMin" type="number" step="0.1" value="${formSetup.targetEcMin}" /></label>
        <label>EC Max<input name="targetEcMax" type="number" step="0.1" value="${formSetup.targetEcMax}" /></label>
        <label>Water Temp Min C<input name="targetWaterTempMin" type="number" step="0.1" value="${formSetup.targetWaterTempMin}" /></label>
        <label>Water Temp Max C<input name="targetWaterTempMax" type="number" step="0.1" value="${formSetup.targetWaterTempMax}" /></label>
        <label class="span-2">Nutrient Formula<input name="nutrientFormula" value="${escapeAttr(formSetup.nutrientFormula)}" /></label>
        <label>Pump Schedule<input name="pumpSchedule" value="${escapeAttr(formSetup.pumpSchedule)}" /></label>
        <label>Location<input name="location" value="${escapeAttr(formSetup.location)}" /></label>
        <label class="span-2">Notes<textarea name="notes" rows="3">${escapeHtml(formSetup.notes)}</textarea></label>
        <button class="btn primary span-2" type="submit">${formSetup.id ? "Save Setup" : "Create Setup"}</button>
      </form>
    </section>
  `;
}

function renderWeeklyLog() {
  const setup = selectedSetup();
  const draft = draftSensor && draftSensor.setupId === setup.id ? draftSensor : {};
  const latest = latestLogForSetup(state.logs, setup.id);
  const today = todayISO();

  return `
    <section class="panel">
      <div class="section-head">
        <h2>Weekly Log</h2>
        <select data-select-setup>${setupOptions(setup.id)}</select>
      </div>
      <form id="weekly-log-form" class="form-grid">
        <input type="hidden" name="setupId" value="${setup.id}" />
        <label>Date<input name="date" type="date" required value="${today}" /></label>
        <label>Water Volume L<input name="waterVolumeLiters" type="number" step="0.1" value="${draft.waterLevelLiters || latest?.waterVolumeLiters || setup.normalWaterVolumeLiters}" /></label>
        <label>pH<input name="ph" type="number" step="0.01" required value="${draft.ph || ""}" /></label>
        <label>TDS ppm<input name="tdsPpm" type="number" step="1" value="${draft.tdsPpm || ""}" /></label>
        <label>Water Temp C<input name="waterTempC" type="number" step="0.1" value="${draft.waterTempC || ""}" /></label>
        <label>Air Temp C<input name="airTempC" type="number" step="0.1" /></label>
        <label>Root Color
          <select name="rootColor">
            <option>white</option><option>cream</option><option>brown</option><option>black</option>
          </select>
        </label>
        <label>Root Smell
          <select name="rootSmell">
            <option>normal</option><option>foul</option><option>rotten</option>
          </select>
        </label>
        <label>Algae
          <select name="algaeLevel">
            <option>none</option><option>mild</option><option>heavy</option>
          </select>
        </label>
        <label>Pest Signs<input name="pestSigns" placeholder="aphids, whiteflies" /></label>
        <fieldset class="span-2 checklist">
          <legend>Symptoms</legend>
          ${SYMPTOMS.map(([id, label]) => `<label><input type="checkbox" name="symptoms" value="${id}" /> ${escapeHtml(label)}</label>`).join("")}
        </fieldset>
        <label class="span-2">Actions Taken<textarea name="actionsTaken" rows="2"></textarea></label>
        <label class="span-2">Notes<textarea name="notes" rows="2"></textarea></label>
        <label class="span-2 file-box">Plant Photos for Diagnosis<input id="log-photos" name="photos" type="file" accept="image/*" capture="environment" multiple /></label>
        <button class="btn primary span-2" type="submit">Save Log and Diagnose</button>
      </form>
    </section>
  `;
}

function renderRecommendations() {
  const setup = selectedSetup();
  const latest = latestLogForSetup(state.logs, setup.id);
  const result = latest ? { severity: latest.recommendations?.[0]?.severity || evaluateLog(setup, latest).severity, recommendations: latest.recommendations || evaluateLog(setup, latest).recommendations } : null;
  const latestPhoto = latest?.photos?.at(-1);
  const items = result?.recommendations?.map((rec) => `
    <article class="action-card ${rec.severity.toLowerCase()}">
      <span class="badge ${rec.severity.toLowerCase()}">${rec.severity}</span>
      <h3>${escapeHtml(rec.issue)}</h3>
      <p><b>Likely cause:</b> ${escapeHtml(rec.likelyCause)}</p>
      <p><b>Action:</b> ${escapeHtml(rec.recommendedAction)}</p>
      ${rec.warning ? `<p class="warning-text">${escapeHtml(rec.warning)}</p>` : ""}
    </article>
  `).join("") || `<div class="empty">No weekly log yet.</div>`;

  return `
    <section class="panel">
      <div class="section-head">
        <h2>Corrective Actions</h2>
        <select data-select-setup>${setupOptions(setup.id)}</select>
      </div>
      <div class="mini-summary">
        <span>${latest ? `Latest log: ${escapeHtml(latest.date)}` : "No log"}</span>
        <span>Targets: pH ${setup.targetPhMin}-${setup.targetPhMax}, EC ${setup.targetEcMin}-${setup.targetEcMax}</span>
      </div>
      <div class="diagnosis-grid">
        <div class="diagnosis-photo">
          ${latestPhoto
            ? `<img src="${latestPhoto.dataUrl}" alt="${escapeAttr(latestPhoto.name || "Latest plant photo")}" />`
            : `<div class="empty compact">No plant photo in the latest log.</div>`}
        </div>
        <div>
          <h3>Photo-Assisted Diagnosis</h3>
          <p>The findings below use your remaining readings and observations. Share the latest photo and readings to ChatGPT for visual assessment.</p>
          <button class="btn primary" data-action="share-diagnosis" data-id="${latest?.id || ""}" type="button" ${latestPhoto ? "" : "disabled"}>Share Photo + Readings</button>
        </div>
      </div>
      <div class="action-list">${items}</div>
      <p class="advisory">Advisory only. Verify with actual plant, root, reservoir, and pest observations before applying corrective chemicals.</p>
    </section>
  `;
}

function renderSensors() {
  const rows = [...state.sensorReadings].sort((a, b) => String(b.dateTime).localeCompare(String(a.dateTime))).slice(0, 20);
  return `
    <section class="two-column">
      <form class="panel form-grid" id="sensor-form">
        <h2 class="span-2">Sensor Reading</h2>
        <label class="span-2">Setup<select name="setupId">${setupOptions()}</select></label>
        <label>Date/Time<input name="dateTime" type="datetime-local" value="${todayISO()}T07:00" /></label>
        <label>pH<input name="ph" type="number" step="0.01" /></label>
        <label>TDS ppm<input name="tdsPpm" type="number" step="1" /></label>
        <label>Water Temp C<input name="waterTempC" type="number" step="0.1" /></label>
        <label>Water Level L<input name="waterLevelLiters" type="number" step="0.1" /></label>
        <label class="span-2">Source<input name="source" value="Manual meter" /></label>
        <button class="btn primary span-2" type="submit">Save Sensor Reading</button>
      </form>
      <form class="panel" id="sensor-import-form">
        <h2>CSV Import</h2>
        <textarea name="csv" rows="12" placeholder="setup,dateTime,ph,tdsPpm,waterTempC,waterLevelLiters&#10;Lettuce NFT A,2026-06-05T07:00,6.2,780,28,92"></textarea>
        <button class="btn" type="submit">Import CSV</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-head compact"><h2>Sensor History</h2></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Setup</th><th>pH</th><th>EC</th><th>Temp</th><th>Water</th><th></th></tr></thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.dateTime)}</td>
                <td>${escapeHtml(setupById(row.setupId)?.name || "Unassigned")}</td>
                <td>${number(row.ph, 2)}</td>
                <td>${number(row.ec, 2)}</td>
                <td>${number(row.waterTempC, 1)}</td>
                <td>${number(row.waterLevelLiters, 1)}</td>
                <td class="table-actions">
                  <button class="btn tiny" data-action="use-sensor" data-id="${row.id}" type="button">Use</button>
                  <button class="btn tiny ghost" data-action="delete-sensor" data-id="${row.id}" type="button">Delete</button>
                </td>
              </tr>
            `).join("") || `<tr><td colspan="7">No sensor readings yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderHistory() {
  const setup = selectedSetup();
  const logs = [...state.logs].filter((log) => log.setupId === setup.id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const photos = logs.flatMap((log) => (log.photos || []).map((photo) => ({ ...photo, date: log.date }))).slice(-24).reverse();
  const rows = [...logs].reverse().slice(0, 20).map((log) => `
    <tr>
      <td>${escapeHtml(log.date)}</td><td>${number(log.ph, 2)}</td><td>${number(log.ec, 2)}</td><td>${number(log.waterTempC, 1)}</td>
      <td>${number(log.waterVolumeLiters, 1)}</td><td>${(log.recommendations || [])[0]?.severity || "-"}</td>
      <td><button class="btn tiny ghost" data-action="delete-log" data-id="${log.id}" type="button">Delete</button></td>
    </tr>
  `).join("");

  return `
    <section class="panel">
      <div class="section-head">
        <h2>History</h2>
        <select data-select-setup>${setupOptions(setup.id)}</select>
      </div>
      <div class="chart-grid">
        ${trendSvg(logs, "ph", "pH", "#0b7a75")}
        ${trendSvg(logs, "ec", "EC", "#2563eb")}
        ${trendSvg(logs, "waterTempC", "Water Temp C", "#dc7b16")}
        ${trendSvg(logs, "waterVolumeLiters", "Volume L", "#4b5563")}
      </div>
    </section>
    <section class="panel">
      <h2>Photo Timeline</h2>
      <div class="photo-grid">
        ${photos.map((photo) => `<figure><img src="${photo.dataUrl}" alt="${escapeAttr(photo.name || "Plant photo")}" /><figcaption>${escapeHtml(photo.date)} / ${escapeHtml(photo.name || "photo")}</figcaption></figure>`).join("") || `<div class="empty">No photos yet.</div>`}
      </div>
    </section>
    <section class="panel">
      <h2>Log Table</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>pH</th><th>EC</th><th>Temp</th><th>Water</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7">No logs yet.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSync() {
  const reminders = state.reminders.map((item) => `
    <div class="list-row plain">
      <span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.day)} ${escapeHtml(item.time)} / ${item.enabled ? "On" : "Off"}</small></span>
    </div>
  `).join("");

  return `
    <section class="two-column">
      <div class="panel">
        <h2>Backup and CSV</h2>
        <div class="button-grid">
          <button class="btn primary" data-action="export-backup" type="button">Export Backup</button>
          <button class="btn" data-action="share-backup" type="button">Share Backup</button>
          <label class="btn file-button">Import Backup<input id="restore-file" type="file" accept="application/json,.json" /></label>
          ${["setups", "logs", "recommendations", "sensors"].map((kind) => `<button class="btn ghost" data-action="export-csv" data-kind="${kind}" type="button">${kind}.csv</button>`).join("")}
        </div>
      </div>
      <form class="panel form-grid" id="reminder-form">
        <h2 class="span-2">Reminder</h2>
        <label class="span-2">Title<input name="title" value="Weekly hydroponics readings" /></label>
        <label>Day
          <select name="day">
            ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => `<option>${day}</option>`).join("")}
          </select>
        </label>
        <label>Time<input name="time" type="time" value="07:00" /></label>
        <label class="check-inline span-2"><input type="checkbox" name="enabled" checked /> Enabled</label>
        <button class="btn primary span-2" type="submit">Save Reminder</button>
        <button class="btn span-2" data-action="request-notifications" type="button">Enable Notifications</button>
      </form>
    </section>
    <section class="panel">
      <div class="section-head compact">
        <h2>Saved Reminders</h2>
        <button class="btn danger" data-action="clear-data" type="button">Clear All Data</button>
      </div>
      <div class="list-stack">${reminders || `<div class="empty">No reminders yet.</div>`}</div>
    </section>
  `;
}

async function saveSetup(form) {
  const data = new FormData(form);
  const crop = String(data.get("crop"));
  const preset = CROP_PRESETS[crop] || CROP_PRESETS.Lettuce;
  const id = String(data.get("id") || uid("setup"));
  const existing = setupById(id);
  const setup = {
    ...(existing || {}),
    id,
    name: String(data.get("name") || preset.crop),
    crop,
    variety: String(data.get("variety") || ""),
    systemType: String(data.get("systemType") || "NFT"),
    tankCapacityLiters: numeric(data.get("tankCapacityLiters"), 0),
    normalWaterVolumeLiters: numeric(data.get("normalWaterVolumeLiters"), 0),
    tdsScale: numeric(data.get("tdsScale"), ""),
    targetPhMin: numeric(data.get("targetPhMin"), preset.targetPhMin),
    targetPhMax: numeric(data.get("targetPhMax"), preset.targetPhMax),
    targetEcMin: numeric(data.get("targetEcMin"), preset.targetEcMin),
    targetEcMax: numeric(data.get("targetEcMax"), preset.targetEcMax),
    targetWaterTempMin: numeric(data.get("targetWaterTempMin"), preset.targetWaterTempMin),
    targetWaterTempMax: numeric(data.get("targetWaterTempMax"), preset.targetWaterTempMax),
    nutrientFormula: String(data.get("nutrientFormula") || ""),
    pumpSchedule: String(data.get("pumpSchedule") || ""),
    location: String(data.get("location") || ""),
    notes: String(data.get("notes") || ""),
    createdAt: existing?.createdAt || todayISO(),
    updatedAt: todayISO()
  };

  state.setups = existing ? state.setups.map((item) => (item.id === id ? setup : item)) : [...state.setups, setup];
  selectedSetupId = setup.id;
  editingSetupId = setup.id;
  await saveState(state);
  toast("Setup saved");
  render();
}

async function saveWeeklyLog(form) {
  const data = new FormData(form);
  const setup = setupById(String(data.get("setupId")));
  const photos = await readPhotos(document.querySelector("#log-photos")?.files || []);
  const tdsPpm = numeric(data.get("tdsPpm"), "");
  const ec = calculateEc(tdsPpm, setup.tdsScale);
  const timestamp = new Date().toISOString();
  const log = {
    id: uid("log"),
    setupId: setup.id,
    date: String(data.get("date") || todayISO()),
    waterVolumeLiters: numeric(data.get("waterVolumeLiters"), ""),
    ph: numeric(data.get("ph"), ""),
    tdsPpm,
    ec,
    waterTempC: numeric(data.get("waterTempC"), ""),
    airTempC: numeric(data.get("airTempC"), ""),
    rootColor: String(data.get("rootColor") || "white"),
    rootSmell: String(data.get("rootSmell") || "normal"),
    algaeLevel: String(data.get("algaeLevel") || "none"),
    pestSigns: splitTags(data.get("pestSigns")),
    symptoms: data.getAll("symptoms"),
    actionsTaken: String(data.get("actionsTaken") || ""),
    notes: String(data.get("notes") || ""),
    photos,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  log.recommendations = evaluateLog(setup, log).recommendations;
  state.logs = [...state.logs, log];
  selectedSetupId = setup.id;
  draftSensor = null;
  await saveState(state);
  toast("Weekly log saved");
  activeView = "recommendations";
  render();
}

async function saveSensor(form) {
  const data = new FormData(form);
  const setup = setupById(String(data.get("setupId")));
  const tdsPpm = numeric(data.get("tdsPpm"), "");
  const reading = {
    id: uid("sensor"),
    setupId: setup.id,
    dateTime: String(data.get("dateTime") || `${todayISO()}T07:00`),
    ph: numeric(data.get("ph"), ""),
    tdsPpm,
    ec: calculateEc(tdsPpm, setup.tdsScale),
    waterTempC: numeric(data.get("waterTempC"), ""),
    waterLevelLiters: numeric(data.get("waterLevelLiters"), ""),
    source: String(data.get("source") || "Manual meter"),
    createdAt: todayISO()
  };
  state.sensorReadings = [...state.sensorReadings, reading];
  await saveState(state);
  toast("Sensor reading saved");
  render();
}

async function importSensors(form) {
  const data = new FormData(form);
  const rows = parseSensorCsv(String(data.get("csv") || ""), state.setups, selectedSetupId);
  state.sensorReadings = [...state.sensorReadings, ...rows];
  await saveState(state);
  toast(`${rows.length} sensor readings imported`);
  render();
}

async function saveReminder(form) {
  const data = new FormData(form);
  state.reminders = [
    ...state.reminders,
    {
      id: uid("reminder"),
      title: String(data.get("title") || "Weekly hydroponics readings"),
      day: String(data.get("day") || "Sunday"),
      time: String(data.get("time") || "07:00"),
      enabled: data.get("enabled") === "on",
      lastNotified: ""
    }
  ];
  await saveState(state);
  toast("Reminder saved");
  render();
}

async function seedDemo() {
  if (!confirm("Replace current HydroCheck data with sample farm data?")) return;
  state = createDefaultState();
  selectedSetupId = state.setups[0].id;
  editingSetupId = selectedSetupId;
  await saveState(state);
  toast("Demo data loaded");
  render();
}

async function deleteLog(id) {
  if (!confirm("Delete this weekly log?")) return;
  state.logs = state.logs.filter((log) => log.id !== id);
  await saveState(state);
  render();
}

async function deleteSensor(id) {
  state.sensorReadings = state.sensorReadings.filter((item) => item.id !== id);
  await saveState(state);
  render();
}

function useSensorAsDraft(id) {
  draftSensor = state.sensorReadings.find((item) => item.id === id) || null;
  if (draftSensor) {
    selectedSetupId = draftSensor.setupId;
    activeView = "log";
    render();
  }
}

function exportBackup() {
  downloadBlob(
    `${state.settings.backupName || "hydrocheck"}_${todayISO()}.json`,
    JSON.stringify(state, null, 2),
    "application/json"
  );
}

async function shareBackup() {
  const file = new File([JSON.stringify(state, null, 2)], `${state.settings.backupName || "hydrocheck"}_${todayISO()}.json`, {
    type: "application/json"
  });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "HydroCheck PH backup" });
  } else {
    exportBackup();
  }
}

async function shareDiagnosis(logId) {
  const log = state.logs.find((item) => item.id === logId);
  const setup = log ? setupById(log.setupId) : null;
  if (!log || !setup || !(log.photos || []).length) {
    toast("Add a plant photo to the latest log first");
    return;
  }

  const text = buildDiagnosisRequest(setup, log);
  const files = [];
  for (const [index, photo] of (log.photos || []).slice(-3).entries()) {
    files.push(await photoFile(photo, index));
  }

  try {
    if (navigator.canShare?.({ files })) {
      await navigator.share({
        title: `Plant diagnosis - ${setup.name}`,
        text,
        files
      });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: `Plant diagnosis - ${setup.name}`, text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast("Diagnosis readings copied");
  } catch (error) {
    if (error?.name !== "AbortError") toast("Unable to open the share menu");
  }
}

async function photoFile(photo, index) {
  const response = await fetch(photo.dataUrl);
  const blob = await response.blob();
  const extension = blob.type === "image/png" ? "png" : "jpg";
  const originalName = String(photo.name || "").replace(/[^a-z0-9._-]/gi, "_");
  const name = originalName || `plant_${index + 1}.${extension}`;
  return new File([blob], name, { type: blob.type || photo.type || "image/jpeg" });
}

async function importBackup(file) {
  if (!file) return;
  const text = await file.text();
  const imported = JSON.parse(text);
  state = mergeState(createDefaultState(), imported);
  selectedSetupId = state.setups[0]?.id || "";
  editingSetupId = selectedSetupId;
  await saveState(state);
  toast("Backup restored");
  render();
}

function exportCsv(kind) {
  const rows = exportableRows(state, kind);
  const columns = csvColumns(kind);
  downloadBlob(`hydrocheck_${kind}_${todayISO()}.csv`, rowsToCsv(rows, columns), "text/csv;charset=utf-8");
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    toast("Notifications are not supported in this browser");
    return;
  }
  const permission = await Notification.requestPermission();
  toast(`Notification permission: ${permission}`);
}

async function clearAllData() {
  if (!confirm("Delete all app data from this browser?")) return;
  await clearState();
  state = createDefaultState();
  selectedSetupId = state.setups[0].id;
  editingSetupId = selectedSetupId;
  await saveState(state);
  render();
}

function checkDueReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const today = todayISO(now);
  const day = now.toLocaleDateString("en-US", { weekday: "long" });
  const hhmm = now.toTimeString().slice(0, 5);
  let changed = false;

  for (const reminder of state.reminders || []) {
    if (!reminder.enabled || reminder.day !== day || reminder.time > hhmm || reminder.lastNotified === today) continue;
    new Notification(reminder.title, { body: "Record pH, EC/TDS, water temperature, volume, roots, pests, and photos." });
    reminder.lastNotified = today;
    changed = true;
  }

  if (changed) saveState(state);
}

function trendSvg(logs, field, label, color) {
  const values = logs.map((log) => Number(log[field])).filter(Number.isFinite);
  if (!values.length) {
    return `<div class="chart-card"><h3>${label}</h3><div class="empty compact">No data</div></div>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 320;
  const height = 120;
  const pad = 18;
  const points = logs.map((log, index) => {
    const value = Number(log[field]);
    const x = pad + (index / Math.max(1, logs.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return `${x},${Number.isFinite(value) ? y : height - pad}`;
  }).join(" ");

  return `
    <div class="chart-card">
      <h3>${label}</h3>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(label)} trend">
        <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" />
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        ${points.split(" ").map((point) => {
          const [x, y] = point.split(",");
          return `<circle cx="${x}" cy="${y}" r="4" fill="${color}" />`;
        }).join("")}
      </svg>
      <p>${number(min, 2)} to ${number(max, 2)}</p>
    </div>
  `;
}

async function readPhotos(fileList) {
  const files = [...fileList].slice(0, 8);
  const photos = [];
  for (const file of files) {
    photos.push(await compressImage(file));
  }
  return photos;
}

function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1000;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({
          id: uid("photo"),
          name: file.name,
          type: file.type,
          dataUrl: canvas.toDataURL("image/jpeg", 0.78),
          createdAt: todayISO()
        });
      };
      img.onerror = () => resolve({ id: uid("photo"), name: file.name, type: file.type, dataUrl: reader.result, createdAt: todayISO() });
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && value !== "" ? n : fallback;
}

function splitTags(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function toast(message) {
  const template = document.querySelector("#toast-template");
  const node = template.content.firstElementChild.cloneNode(true);
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.classList.add("show"), 10);
  setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 200);
  }, 2200);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}
