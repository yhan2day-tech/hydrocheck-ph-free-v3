/*
 * Main application logic for HydroCheck PH
 *
 * This script manages the IndexedDB via Dexie, handles UI interactions,
 * stores setups and logs, computes EC from TDS and generates basic
 * recommendations based on simple rules.
 */

let db;
let currentSetupId = null;
let editingSetupId = null;
let deferredInstallPrompt = null;
let phChart = null;
let ecChart = null;
let tempChart = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Initialize Dexie database
  db = new Dexie('HydroCheckDB');
  db.version(1).stores({
    setups: '++id,name,crop,createdAt',
    logs: '++id,setupId,date',
    recos: '++id,logId,severity'
  });

  // Register service worker for offline support
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('service-worker.js');
    } catch (err) {
      console.error('Service worker registration failed:', err);
    }
  }

  // Attach UI event listeners
  document.getElementById('add-setup-btn').addEventListener('click', () => showSetupForm());
  document.getElementById('cancel-setup-btn').addEventListener('click', hideSetupForm);
  document.getElementById('setup-form').addEventListener('submit', saveSetup);
  document.getElementById('install-btn').addEventListener('click', installApp);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    document.getElementById('install-btn').hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    document.getElementById('install-btn').hidden = true;
  });

  document.getElementById('back-btn').addEventListener('click', () => {
    document.getElementById('details-section').classList.add('hidden');
    document.getElementById('setup-section').classList.remove('hidden');
    currentSetupId = null;
  });

  document.getElementById('add-log-btn').addEventListener('click', showLogForm);
  document.getElementById('cancel-log-btn').addEventListener('click', hideLogForm);
  document.getElementById('log-form').addEventListener('submit', saveLog);

  document.getElementById('export-btn').addEventListener('click', exportCSV);

  // Load initial setups list
  await loadSetups();
}

// Load and render all setups in the list
async function loadSetups() {
  const listEl = document.getElementById('setups-list');
  listEl.innerHTML = '';
  const setups = await db.setups.toArray();
  if (setups.length === 0) {
    const placeholder = document.createElement('li');
    placeholder.textContent = 'No setups yet. Add one to get started.';
    placeholder.style.fontStyle = 'italic';
    listEl.appendChild(placeholder);
  } else {
    setups.forEach(setup => {
      const li = document.createElement('li');
      const openButton = document.createElement('button');
      openButton.className = 'setup-open';
      openButton.type = 'button';
      openButton.textContent = setup.name;
      openButton.addEventListener('click', () => openDetails(setup.id));

      const editButton = document.createElement('button');
      editButton.className = 'secondary-btn compact-btn';
      editButton.type = 'button';
      editButton.textContent = 'Edit';
      editButton.addEventListener('click', () => showSetupForm(setup.id));

      li.append(openButton, editButton);
      listEl.appendChild(li);
    });
  }
}

// Show the setup form modal
async function showSetupForm(setupId = null) {
  const form = document.getElementById('setup-form');
  form.reset();
  editingSetupId = setupId;
  document.getElementById('setup-form-title').textContent = setupId ? 'Edit Setup' : 'Add Setup';

  if (setupId) {
    const setup = await db.setups.get(setupId);
    if (!setup) return;
    document.getElementById('setup-name').value = setup.name || '';
    document.getElementById('setup-crop').value = setup.crop || '';
    document.getElementById('setup-system-type').value = setup.systemType || 'NFT';
    document.getElementById('setup-capacity').value = setup.tankCapacityLiters ?? '';
    document.getElementById('setup-tds-scale').value = setup.tdsScale || 500;
    document.getElementById('setup-ph-min').value = setup.targetPhMin ?? '';
    document.getElementById('setup-ph-max').value = setup.targetPhMax ?? '';
    document.getElementById('setup-ec-min').value = setup.targetEcMin ?? '';
    document.getElementById('setup-ec-max').value = setup.targetEcMax ?? '';
    document.getElementById('setup-temp-min').value = setup.targetTempMin ?? '';
    document.getElementById('setup-temp-max').value = setup.targetTempMax ?? '';
    document.getElementById('setup-nutrient').value = setup.nutrientFormula || '';
  }

  document.getElementById('setup-form-container').classList.remove('hidden');
}

// Hide the setup form modal
function hideSetupForm() {
  editingSetupId = null;
  document.getElementById('setup-form-container').classList.add('hidden');
}

function numberOrNull(id) {
  const value = document.getElementById(id).value;
  return value === '' ? null : Number(value);
}

// Save a new setup or update an existing one
async function saveSetup(event) {
  event.preventDefault();
  const existing = editingSetupId ? await db.setups.get(editingSetupId) : null;
  const setup = {
    name: document.getElementById('setup-name').value.trim(),
    crop: document.getElementById('setup-crop').value.trim(),
    systemType: document.getElementById('setup-system-type').value,
    tankCapacityLiters: numberOrNull('setup-capacity'),
    tdsScale: parseInt(document.getElementById('setup-tds-scale').value, 10) || 500,
    targetPhMin: numberOrNull('setup-ph-min'),
    targetPhMax: numberOrNull('setup-ph-max'),
    targetEcMin: numberOrNull('setup-ec-min'),
    targetEcMax: numberOrNull('setup-ec-max'),
    targetTempMin: numberOrNull('setup-temp-min'),
    targetTempMax: numberOrNull('setup-temp-max'),
    nutrientFormula: document.getElementById('setup-nutrient').value.trim() || '',
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!setup.name) {
    alert('Please enter a name for the setup.');
    return;
  }
  const savedSetupId = editingSetupId || await db.setups.add(setup);
  if (editingSetupId) {
    await db.setups.update(editingSetupId, setup);
  }
  hideSetupForm();
  await loadSetups();
  if (currentSetupId === savedSetupId) {
    await openDetails(savedSetupId);
  }
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('install-btn').hidden = true;
}

// Open the details view for a selected setup
async function openDetails(setupId) {
  currentSetupId = setupId;
  const setup = await db.setups.get(setupId);
  if (!setup) return;
  // Hide setups list and show details
  document.getElementById('setup-section').classList.add('hidden');
  document.getElementById('details-section').classList.remove('hidden');
  // Populate setup info
  document.getElementById('details-title').textContent = setup.name;
  const info = document.getElementById('setup-info');
  info.innerHTML = '';
  const fields = [
    ['Crop', setup.crop],
    ['System type', setup.systemType],
    ['Tank capacity', setup.tankCapacityLiters ? setup.tankCapacityLiters + ' L' : '–'],
    ['TDS scale', setup.tdsScale || 500],
    ['Target pH', setup.targetPhMin && setup.targetPhMax ? setup.targetPhMin + '–' + setup.targetPhMax : '–'],
    ['Target EC', setup.targetEcMin && setup.targetEcMax ? setup.targetEcMin + '–' + setup.targetEcMax + ' mS/cm' : '–'],
    ['Target Temp', setup.targetTempMin && setup.targetTempMax ? setup.targetTempMin + '–' + setup.targetTempMax + ' °C' : '–'],
    ['Nutrient formula', setup.nutrientFormula || '–']
  ];
  fields.forEach(([label, value]) => {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${label}:</strong> ${value}`;
    info.appendChild(div);
  });
  // Load logs and render
  await loadLogs(setupId);
}

// Load logs for a setup, update table and charts
async function loadLogs(setupId) {
  const logs = await db.logs.where('setupId').equals(setupId).toArray();
  // Sort logs by date
  logs.sort((a, b) => new Date(a.date) - new Date(b.date));
  // Render table
  const tbody = document.querySelector('#logs-table tbody');
  tbody.innerHTML = '';
  logs.forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${log.date}</td>
      <td>${log.waterVolumeLiters ?? ''}</td>
      <td>${log.ph ?? ''}</td>
      <td>${log.ec?.toFixed(2) ?? ''}</td>
      <td>${log.waterTempC ?? ''}</td>
      <td>${log.recommendationSummary || ''}</td>
    `;
    tbody.appendChild(tr);
  });
  // Update charts
  updateCharts(logs);
}

// Show the log form modal
function showLogForm() {
  const form = document.getElementById('log-form');
  form.reset();
  // Set default date to today
  const today = new Date().toISOString().substr(0, 10);
  document.getElementById('log-date').value = today;
  document.getElementById('log-form-container').classList.remove('hidden');
}

// Hide the log form modal
function hideLogForm() {
  document.getElementById('log-form-container').classList.add('hidden');
}

// Save a new log and generate recommendation
async function saveLog(event) {
  event.preventDefault();
  if (!currentSetupId) return;
  const setup = await db.setups.get(currentSetupId);
  // Gather input values
  const log = {
    setupId: currentSetupId,
    date: document.getElementById('log-date').value,
    waterVolumeLiters: parseFloat(document.getElementById('log-volume').value) || null,
    ph: parseFloat(document.getElementById('log-ph').value) || null,
    tdsPpm: parseFloat(document.getElementById('log-tds').value) || null,
    waterTempC: parseFloat(document.getElementById('log-temp').value) || null,
    rootColor: document.getElementById('log-root-color').value || null,
    rootSmell: document.getElementById('log-root-smell').value || null,
    algaeLevel: document.getElementById('log-algae').value || null,
    pestSigns: document.getElementById('log-pests').value.trim() || '',
    symptoms: document.getElementById('log-symptoms').value.trim() || '',
    actionsTaken: document.getElementById('log-actions').value.trim() || '',
    notes: document.getElementById('log-notes').value.trim() || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  // Compute EC from TDS
  if (log.tdsPpm != null && setup.tdsScale) {
    log.ec = log.tdsPpm / setup.tdsScale;
  } else {
    log.ec = null;
  }
  // Generate recommendation
  const reco = computeRecommendation(setup, log);
  log.recommendationSummary = reco.summary;
  // Store log
  const logId = await db.logs.add(log);
  // Store recommendation separately (optional)
  reco.logId = logId;
  await db.recos.add(reco);
  hideLogForm();
  await loadLogs(currentSetupId);
  // Display recommendation alert
  alert(reco.summary + '\n' + (reco.detail || ''));
}

// Compute recommendation based on rules
function computeRecommendation(setup, log) {
  const summaryParts = [];
  let severity = 'good';
  let detail = '';
  // pH check
  if (log.ph != null && setup.targetPhMin != null && setup.targetPhMax != null) {
    if (log.ph < setup.targetPhMin) {
      severity = 'critical';
      summaryParts.push('pH low');
      detail += 'pH is below the target range. Adjust pH upward gradually using a pH up solution.\n';
    } else if (log.ph > setup.targetPhMax) {
      severity = 'critical';
      summaryParts.push('pH high');
      detail += 'pH is above the target range. Adjust pH downward gradually using a pH down solution.\n';
    }
  }
  // EC check
  if (log.ec != null && setup.targetEcMin != null && setup.targetEcMax != null) {
    if (log.ec < setup.targetEcMin) {
      if (severity === 'good') severity = 'warning';
      summaryParts.push('EC low');
      detail += 'Electrical conductivity is below the target range. Add complete nutrient solution slowly and recheck.\n';
    } else if (log.ec > setup.targetEcMax) {
      if (severity !== 'critical') severity = 'warning';
      summaryParts.push('EC high');
      detail += 'Electrical conductivity is above the target range. Dilute with clean water or replace part of the solution and recheck pH.\n';
    }
  }
  // Temperature check
  if (log.waterTempC != null && setup.targetTempMax != null) {
    if (log.waterTempC >= 30) {
      if (severity !== 'critical') severity = 'warning';
      summaryParts.push('High temperature');
      detail += 'Water temperature is high. Warm water holds less dissolved oxygen and can lead to root stress. Shade or insulate the tank, increase aeration and consider cooling measures.\n';
    } else if (setup.targetTempMin != null && log.waterTempC < setup.targetTempMin) {
      if (severity !== 'critical') severity = 'warning';
      summaryParts.push('Low temperature');
      detail += 'Water temperature is low. Cold water slows growth and may increase disease risk. Consider warming or insulating the reservoir.\n';
    }
  }
  // Root condition
  if (log.rootColor === 'brown' || log.rootSmell === 'foul') {
    severity = 'critical';
    summaryParts.push('Root issue');
    detail += 'Roots are discoloured or smell foul. This may indicate low oxygen or root disease. Check aeration, lower water temperature, remove dead roots and sanitise the system.\n';
  }
  // Basic symptom suggestions
  if (log.symptoms && severity !== 'critical') {
    // Example: if symptoms mention yellow and pH > target high -> possible iron deficiency due to high pH
    const symp = log.symptoms.toLowerCase();
    if (symp.includes('yellow') && log.ph != null && setup.targetPhMax != null && log.ph > setup.targetPhMax) {
      summaryParts.push('Possible iron lockout');
      detail += 'Yellowing may be due to iron lockout from high pH. Correct pH before adding iron supplements.\n';
      if (severity === 'good') severity = 'watch';
    } else if (symp.includes('yellow') && log.ph != null && setup.targetPhMax != null && log.ph <= setup.targetPhMax) {
      summaryParts.push('Possible magnesium deficiency');
      detail += 'Yellowing on older leaves may indicate magnesium deficiency. Confirm EC is within range and then consider adding Epsom salts.\n';
      if (severity === 'good') severity = 'watch';
    }
    // Additional symptom patterns can be added here
  }
  // If no issues detected
  if (summaryParts.length === 0) {
    summaryParts.push('All good');
    detail += 'Parameters appear within target ranges. Maintain monitoring and good hygiene practices.';
  }
  return {
    severity,
    summary: summaryParts.join('; '),
    detail: detail.trim()
  };
}

// Update charts using Chart.js
function updateCharts(logs) {
  // Extract data arrays
  const dates = logs.map(l => l.date);
  const phData = logs.map(l => (l.ph != null ? l.ph : null));
  const ecData = logs.map(l => (l.ec != null ? parseFloat(l.ec.toFixed(2)) : null));
  const tempData = logs.map(l => (l.waterTempC != null ? l.waterTempC : null));
  const configTemplate = (label, data, borderColor) => ({
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label,
          data,
          borderColor,
          fill: false,
          tension: 0.1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'category',
          title: { display: true, text: 'Date' }
        },
        y: {
          beginAtZero: false
        }
      }
    }
  });
  // Destroy existing charts if any
  if (phChart) phChart.destroy();
  if (ecChart) ecChart.destroy();
  if (tempChart) tempChart.destroy();
  // Create new charts
  const phCtx = document.getElementById('ph-chart').getContext('2d');
  phChart = new Chart(phCtx, configTemplate('pH', phData, '#ff5722'));
  const ecCtx = document.getElementById('ec-chart').getContext('2d');
  ecChart = new Chart(ecCtx, configTemplate('EC (mS/cm)', ecData, '#3f51b5'));
  const tempCtx = document.getElementById('temp-chart').getContext('2d');
  tempChart = new Chart(tempCtx, configTemplate('Water Temp (°C)', tempData, '#009688'));
}

// Export logs to CSV
async function exportCSV() {
  if (!currentSetupId) return;
  const setup = await db.setups.get(currentSetupId);
  const logs = await db.logs.where('setupId').equals(currentSetupId).toArray();
  if (logs.length === 0) {
    alert('No logs to export.');
    return;
  }
  // Prepare CSV header
  const header = [
    'Date','WaterVolume(L)','pH','TDS(ppm)','EC(mS/cm)','WaterTemp(°C)','RootColor','RootSmell','AlgaeLevel','PestSigns','Symptoms','ActionsTaken','Notes','Recommendation'
  ];
  const rows = logs.map(log => [
    log.date || '',
    log.waterVolumeLiters ?? '',
    log.ph ?? '',
    log.tdsPpm ?? '',
    log.ec != null ? log.ec.toFixed(2) : '',
    log.waterTempC ?? '',
    log.rootColor || '',
    log.rootSmell || '',
    log.algaeLevel || '',
    log.pestSigns || '',
    log.symptoms || '',
    log.actionsTaken || '',
    log.notes || '',
    log.recommendationSummary || ''
  ]);
  const csvContent = [header.join(','), ...rows.map(r => r.map(val => '"' + String(val).replace(/"/g, '""') + '"').join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = setup.name.replace(/\s+/g, '_') + '_logs.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
