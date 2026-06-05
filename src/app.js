import {
  CROP_PRESETS,
  SYMPTOMS,
  calculateEc,
  clone,
  computeFinancialSummary,
  createDefaultState,
  csvColumns,
  evaluateLog,
  exportableRows,
  latestLogForSetup,
  mergeState,
  money,
  number,
  parseSensorCsv,
  rowsToCsv,
  setupStatus,
  todayISO,
  uid
} from "./core.js";
import { clearState, loadState, saveState } from "./storage.js";

const VIEWS = [
  ["dashboard", "Dashboard"],
  ["setups", "Setups"],
  ["log", "Weekly Log"],
  ["recommendations", "Actions"],
  ["sensors", "Sensors"],
  ["costs", "Costs"],
  ["history", "History"],
  ["sync", "Sync"]
];

const app = document.querySelector("#app");
const nav = document.querySelector("#nav");
const installButton = document.querySelector("#install-button");
let state = createDefaultState();
let activeView = "dashboard";
let selectedSetupId = "";
let editingSetupId = "";
let draftSensor = null;
let deferredInstallPrompt = null;

boot();

async function boot() {
  state = await loadState(createDefaultState(), mergeState);
  if (!state.setups.length) state = createDefaultState();
  selectedSetupId = state.setups[0]?.id || "";
  editingSetupId = selectedSetupId;
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
    costs: renderCosts,
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
  if (action === "delete-log") deleteLog(id);
  if (action === "delete-cost") deleteCost(id);
  if (action === "use-sensor") useSensorAsDraft(id);
  if (action === "delete-sensor") deleteSensor(id);
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

  if (form.id === "setup-form") await saveSetup(form);
  if (form.id === "weekly-log-form") await saveWeeklyLog(form);
  if (form.id === "sensor-form") await saveSensor(form);
  if (form.id === "sensor-import-form") await importSensors(form);
  if (form.id === "cost-form") await saveCost(form);
  if (form.id === "reminder-form") await saveReminder(form);
}

async function handleChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.matches("[data-select-setup]")) {
    selectedSetupId = target.value;
    if (activeView === "setups") editingSetupId = target.value;
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
  const finance = computeFinancialSummary(state);
  const cards = state.setups.map((setup) => {
    const status = setupStatus(setup, state.logs);
    const latest = status.latest;
    return `
      <article class="setup-card status-${status.severity.toLowerCase()}">
        <div class="card-head">
          <div>
            <h3>${escapeHtml(setup.name)}</h3>
            <p>${escapeHtml(setup.crop)} / ${escapeHtml(setup.systemType)}</p>
          </div>
          <span class="badge ${status.severity.toLowerCase()}">${status.severity}</span>
        </div>
        <div class="reading-grid">
          <span><b>${latest ? number(latest.ph, 2) : "-"}</b><small>pH</small></span>
          <span><b>${latest ? number(latest.ec, 2) : "-"}</b><small>EC</small></span>
          <span><b>${latest ? number(latest.waterTempC, 1) : "-"}</b><small>Water C</small></span>
          <span><b>${latest ? number(latest.waterVolumeLiters, 0) : "-"}</b><small>Liters</small></span>
        </div>
        <p class="next-action">${escapeHtml(status.nextAction)}</p>
        <div class="card-actions">
          <button class="btn small" data-action="open-log" data-id="${setup.id}" type="button">Log</button>
          <button class="btn small ghost" data-action="open-actions" data-id="${setup.id}" type="button">Actions</button>
        </div>
      </article>
    `;
  }).join("");

  const criticalCount = state.setups.filter((setup) => setupStatus(setup, state.logs).severity === "Critical").length;
  const warningCount = state.setups.filter((setup) => ["Warning", "Critical"].includes(setupStatus(setup, state.logs).severity)).length;

  return `
    <section class="metrics">
      <div class="metric"><span>Setups</span><strong>${state.setups.length}</strong></div>
      <div class="metric"><span>Needs Action</span><strong>${warningCount}</strong></div>
      <div class="metric danger"><span>Critical</span><strong>${criticalCount}</strong></div>
      <div class="metric"><span>Profit</span><strong>${money(finance.profit)}</strong></div>
    </section>
    <section class="section-head">
      <h2>Farm Status</h2>
      <button class="btn" data-action="new-setup" type="button">New Setup</button>
    </section>
    <section class="setup-grid">${cards}</section>
  `;
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
    plantingDate: todayISO(),
    transplantDate: todayISO(),
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
        <label>Planting Date<input name="plantingDate" type="date" value="${escapeAttr(formSetup.plantingDate)}" /></label>
        <label>Transplant Date<input name="transplantDate" type="date" value="${escapeAttr(formSetup.transplantDate)}" /></label>
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
        <label>Humidity %<input name="humidity" type="number" step="1" /></label>
        <label>Plant Height cm<input name="plantHeightCm" type="number" step="0.1" /></label>
        <label>Plant Count<input name="plantCount" type="number" step="1" /></label>
        <label>Mortality Count<input name="mortalityCount" type="number" step="1" value="0" /></label>
        <label>Harvest g<input name="harvestWeightGrams" type="number" step="1" value="0" /></label>
        <label>Sales Amount PHP<input name="harvestSalesAmount" type="number" step="0.01" value="0" /></label>
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
        <label class="span-2 file-box">Photos<input id="log-photos" name="photos" type="file" accept="image/*" capture="environment" multiple /></label>
        <button class="btn primary span-2" type="submit">Save Log and Recommendations</button>
      </form>
    </section>
  `;
}

function renderRecommendations() {
  const setup = selectedSetup();
  const latest = latestLogForSetup(state.logs, setup.id);
  const result = latest ? { severity: latest.recommendations?.[0]?.severity || evaluateLog(setup, latest).severity, recommendations: latest.recommendations || evaluateLog(setup, latest).recommendations } : null;
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

function renderCosts() {
  const finance = computeFinancialSummary(state);
  const setupRows = Object.values(finance.bySetup).map((row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${money(row.cost)}</td>
      <td>${money(row.revenue)}</td>
      <td>${number(row.harvestKg, 2)} kg</td>
      <td>${money(row.costPerKg)}</td>
      <td class="${row.profit < 0 ? "neg" : "pos"}">${money(row.profit)}</td>
    </tr>
  `).join("");

  const costs = [...state.costItems].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 25).map((item) => `
    <tr>
      <td>${escapeHtml(item.date)}</td>
      <td>${escapeHtml(setupById(item.setupId)?.name || "")}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.description)}</td>
      <td>${number(item.quantity, 2)} ${escapeHtml(item.unit)}</td>
      <td>${money(item.totalCost)}</td>
      <td><button class="btn tiny ghost" data-action="delete-cost" data-id="${item.id}" type="button">Delete</button></td>
    </tr>
  `).join("");

  return `
    <section class="metrics">
      <div class="metric"><span>Total Cost</span><strong>${money(finance.cost)}</strong></div>
      <div class="metric"><span>Revenue</span><strong>${money(finance.revenue)}</strong></div>
      <div class="metric"><span>Harvest</span><strong>${number(finance.harvestKg, 2)} kg</strong></div>
      <div class="metric ${finance.profit < 0 ? "danger" : ""}"><span>Profit</span><strong>${money(finance.profit)}</strong></div>
    </section>
    <section class="two-column">
      <form class="panel form-grid" id="cost-form">
        <h2 class="span-2">Cost Entry</h2>
        <label class="span-2">Setup<select name="setupId">${setupOptions()}</select></label>
        <label>Date<input name="date" type="date" value="${todayISO()}" /></label>
        <label>Category
          <select name="category">
            <option>nutrients</option><option>pH adjuster</option><option>electricity</option><option>labor</option><option>seeds</option><option>equipment</option><option>packaging</option><option>other</option>
          </select>
        </label>
        <label class="span-2">Description<input name="description" required /></label>
        <label>Quantity<input name="quantity" type="number" step="0.01" value="1" /></label>
        <label>Unit<input name="unit" value="batch" /></label>
        <label class="span-2">Total Cost PHP<input name="totalCost" type="number" step="0.01" required /></label>
        <button class="btn primary span-2" type="submit">Save Cost</button>
      </form>
      <div class="panel">
        <h2>Setup Costing</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Setup</th><th>Cost</th><th>Sales</th><th>Harvest</th><th>Cost/kg</th><th>Profit</th></tr></thead>
            <tbody>${setupRows}</tbody>
          </table>
        </div>
      </div>
    </section>
    <section class="panel">
      <h2>Cost History</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Setup</th><th>Category</th><th>Description</th><th>Qty</th><th>Cost</th><th></th></tr></thead>
          <tbody>${costs || `<tr><td colspan="7">No cost entries yet.</td></tr>`}</tbody>
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
          ${["setups", "logs", "recommendations", "sensors", "costs"].map((kind) => `<button class="btn ghost" data-action="export-csv" data-kind="${kind}" type="button">${kind}.csv</button>`).join("")}
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
    plantingDate: String(data.get("plantingDate") || todayISO()),
    transplantDate: String(data.get("transplantDate") || ""),
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
    humidity: numeric(data.get("humidity"), ""),
    plantHeightCm: numeric(data.get("plantHeightCm"), ""),
    plantCount: numeric(data.get("plantCount"), ""),
    mortalityCount: numeric(data.get("mortalityCount"), 0),
    harvestWeightGrams: numeric(data.get("harvestWeightGrams"), 0),
    harvestSalesAmount: numeric(data.get("harvestSalesAmount"), 0),
    rootColor: String(data.get("rootColor") || "white"),
    rootSmell: String(data.get("rootSmell") || "normal"),
    algaeLevel: String(data.get("algaeLevel") || "none"),
    pestSigns: splitTags(data.get("pestSigns")),
    symptoms: data.getAll("symptoms"),
    actionsTaken: String(data.get("actionsTaken") || ""),
    notes: String(data.get("notes") || ""),
    photos,
    createdAt: todayISO(),
    updatedAt: todayISO()
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

async function saveCost(form) {
  const data = new FormData(form);
  const item = {
    id: uid("cost"),
    setupId: String(data.get("setupId")),
    date: String(data.get("date") || todayISO()),
    category: String(data.get("category") || "other"),
    description: String(data.get("description") || ""),
    quantity: numeric(data.get("quantity"), 1),
    unit: String(data.get("unit") || ""),
    totalCost: numeric(data.get("totalCost"), 0)
  };
  state.costItems = [...state.costItems, item];
  await saveState(state);
  toast("Cost saved");
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

async function deleteCost(id) {
  if (!confirm("Delete this cost item?")) return;
  state.costItems = state.costItems.filter((item) => item.id !== id);
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
