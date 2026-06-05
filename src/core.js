export const APP_VERSION = "3.0.0-free";

export const SEVERITY_SCORE = {
  Good: 0,
  Watch: 1,
  Warning: 2,
  Critical: 3
};

export const CROP_PRESETS = {
  Lettuce: {
    crop: "Lettuce",
    targetPhMin: 6.0,
    targetPhMax: 7.0,
    targetEcMin: 1.2,
    targetEcMax: 1.8,
    targetWaterTempMin: 18,
    targetWaterTempMax: 26,
    targetDaysToHarvest: 35
  },
  Cucumber: {
    crop: "Cucumber",
    targetPhMin: 5.0,
    targetPhMax: 5.5,
    targetEcMin: 1.7,
    targetEcMax: 2.0,
    targetWaterTempMin: 20,
    targetWaterTempMax: 28,
    targetDaysToHarvest: 45
  },
  Eggplant: {
    crop: "Eggplant",
    targetPhMin: 5.8,
    targetPhMax: 6.2,
    targetEcMin: 2.5,
    targetEcMax: 3.5,
    targetWaterTempMin: 20,
    targetWaterTempMax: 28,
    targetDaysToHarvest: 65
  },
  Okra: {
    crop: "Okra",
    targetPhMin: 6.2,
    targetPhMax: 6.8,
    targetEcMin: 2.0,
    targetEcMax: 2.4,
    targetWaterTempMin: 22,
    targetWaterTempMax: 29,
    targetDaysToHarvest: 50
  },
  Pepper: {
    crop: "Pepper",
    targetPhMin: 5.5,
    targetPhMax: 6.0,
    targetEcMin: 0.8,
    targetEcMax: 1.8,
    targetWaterTempMin: 20,
    targetWaterTempMax: 28,
    targetDaysToHarvest: 70
  }
};

export const SYMPTOMS = [
  ["newInterveinalYellowing", "New leaves yellow between veins"],
  ["oldInterveinalYellowing", "Older leaves yellow between veins"],
  ["innerTipBurn", "Inner tip burn"],
  ["leafEdgeBurn", "Leaf edge burn"],
  ["curling", "Curling leaves"],
  ["wilting", "Wilting"],
  ["spots", "Leaf spots"],
  ["holes", "Holes in leaves"],
  ["powderyResidue", "Powdery residue"]
];

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function todayISO(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function money(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

export function number(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function calculateEc(tdsPpm, tdsScale) {
  const ppm = Number(tdsPpm);
  const scale = Number(tdsScale);
  if (!Number.isFinite(ppm) || ppm <= 0) return null;
  if (![500, 700].includes(scale)) return null;
  return Math.round((ppm / scale) * 100) / 100;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function defaultSetups(date = todayISO()) {
  const base = [
    ["Lettuce NFT A", "Lettuce", "NFT", 120, 95],
    ["Cucumber Dutch Bucket", "Cucumber", "Dutch bucket", 180, 145],
    ["Eggplant Kratky Bins", "Eggplant", "Kratky", 150, 120],
    ["Okra Trial DWC", "Okra", "DWC", 100, 80],
    ["Pepper Aeroponics Tower", "Pepper", "Aeroponics", 90, 70]
  ];

  return base.map(([name, crop, systemType, tankCapacityLiters, normalWaterVolumeLiters], index) => {
    const preset = CROP_PRESETS[crop];
    return {
      id: `setup_${index + 1}`,
      name,
      crop,
      variety: "",
      systemType,
      tankCapacityLiters,
      normalWaterVolumeLiters,
      tdsScale: 500,
      targetPhMin: preset.targetPhMin,
      targetPhMax: preset.targetPhMax,
      targetEcMin: preset.targetEcMin,
      targetEcMax: preset.targetEcMax,
      targetWaterTempMin: preset.targetWaterTempMin,
      targetWaterTempMax: preset.targetWaterTempMax,
      plantingDate: date,
      transplantDate: date,
      nutrientFormula: "Complete hydroponic nutrients",
      pumpSchedule: systemType === "Kratky" ? "No pump" : "Continuous or timed circulation",
      location: "Bohol greenhouse",
      notes: "",
      createdAt: date,
      updatedAt: date
    };
  });
}

export function defaultLogs(date = todayISO()) {
  return [
    {
      id: "log_1",
      setupId: "setup_1",
      date,
      waterVolumeLiters: 82,
      ph: 6.4,
      tdsPpm: 760,
      ec: 1.52,
      waterTempC: 28,
      airTempC: 32,
      humidity: 70,
      plantHeightCm: 18,
      plantCount: 80,
      mortalityCount: 1,
      harvestWeightGrams: 0,
      harvestSalesAmount: 0,
      rootColor: "white",
      rootSmell: "normal",
      algaeLevel: "mild",
      pestSigns: [],
      symptoms: [],
      actionsTaken: "Checked pH and reservoir volume.",
      notes: "",
      photos: [],
      recommendations: [],
      createdAt: date,
      updatedAt: date
    },
    {
      id: "log_2",
      setupId: "setup_2",
      date,
      waterVolumeLiters: 92,
      ph: 8.1,
      tdsPpm: 1020,
      ec: 2.04,
      waterTempC: 31,
      airTempC: 34,
      humidity: 66,
      plantHeightCm: 42,
      plantCount: 24,
      mortalityCount: 0,
      harvestWeightGrams: 0,
      harvestSalesAmount: 0,
      rootColor: "cream",
      rootSmell: "normal",
      algaeLevel: "mild",
      pestSigns: [],
      symptoms: ["newInterveinalYellowing"],
      actionsTaken: "",
      notes: "Sample high-pH case.",
      photos: [],
      recommendations: [],
      createdAt: date,
      updatedAt: date
    }
  ];
}

export function createDefaultState(date = todayISO()) {
  const setups = defaultSetups(date);
  const logs = defaultLogs(date);
  const state = {
    version: APP_VERSION,
    settings: {
      currency: "PHP",
      defaultTdsScale: 500,
      reminderDay: "Sunday",
      reminderTime: "07:00",
      backupName: "hydrocheck-ph-free-v3"
    },
    setups,
    logs,
    sensorReadings: [
      {
        id: "sensor_1",
        setupId: "setup_2",
        dateTime: `${date}T07:30`,
        ph: 8.1,
        tdsPpm: 1020,
        ec: 2.04,
        waterTempC: 31,
        waterLevelLiters: 92,
        source: "Manual sample",
        createdAt: date
      }
    ],
    costItems: [
      {
        id: "cost_1",
        setupId: "setup_1",
        date,
        category: "nutrients",
        description: "Masterblend top-up mix",
        quantity: 1,
        unit: "batch",
        totalCost: 85
      },
      {
        id: "cost_2",
        setupId: "setup_2",
        date,
        category: "electricity",
        description: "Pump allocation",
        quantity: 1,
        unit: "week",
        totalCost: 120
      }
    ],
    reminders: [
      {
        id: "reminder_1",
        title: "Weekly hydroponics readings",
        day: "Sunday",
        time: "07:00",
        enabled: true,
        lastNotified: ""
      }
    ],
    createdAt: date,
    updatedAt: date
  };

  state.logs = state.logs.map((log) => {
    const setup = state.setups.find((item) => item.id === log.setupId);
    return { ...log, recommendations: evaluateLog(setup, log).recommendations };
  });

  return state;
}

export function latestLogForSetup(logs, setupId) {
  return [...(logs || [])]
    .filter((log) => log.setupId === setupId)
    .sort((a, b) => `${b.date}${b.updatedAt || ""}`.localeCompare(`${a.date}${a.updatedAt || ""}`))[0];
}

export function evaluateLog(setup, log) {
  const recommendations = [];
  if (!setup || !log) {
    return { severity: "Watch", recommendations: [] };
  }

  const add = (severity, issue, likelyCause, recommendedAction, warning = "") => {
    recommendations.push({ id: uid("rec"), severity, issue, likelyCause, recommendedAction, warning });
  };

  const ph = Number(log.ph);
  const ec = Number.isFinite(Number(log.ec)) ? Number(log.ec) : calculateEc(log.tdsPpm, setup.tdsScale);
  const waterTemp = Number(log.waterTempC);
  const waterVolume = Number(log.waterVolumeLiters);
  const normalVolume = Number(setup.normalWaterVolumeLiters || setup.tankCapacityLiters || 0);
  const symptoms = new Set(log.symptoms || []);
  const pests = log.pestSigns || [];
  const rootColor = String(log.rootColor || "").toLowerCase();
  const rootSmell = String(log.rootSmell || "").toLowerCase();
  const algaeLevel = String(log.algaeLevel || "").toLowerCase();
  const phHigh = Number.isFinite(ph) && ph > Number(setup.targetPhMax);
  const phLow = Number.isFinite(ph) && ph < Number(setup.targetPhMin);

  if (!Number.isFinite(ph)) {
    add("Watch", "Missing pH reading", "Weekly diagnosis is incomplete without pH.", "Record pH before deciding on nutrient corrections.");
  } else if (phHigh) {
    add(
      ph >= 8 ? "Critical" : "Warning",
      "pH is above target",
      "High pH can reduce nutrient availability and imitate deficiencies.",
      "Adjust pH down gradually, mix well, wait, and retest before adding more fertilizer.",
      "Avoid adding single nutrients until pH is corrected and symptoms are rechecked."
    );
  } else if (phLow) {
    add(
      "Warning",
      "pH is below target",
      "Low pH can stress roots and shift nutrient availability.",
      "Adjust pH up gradually, mix well, wait, and retest.",
      "Do not make large pH corrections in one dose."
    );
  }

  if (ec === null) {
    add(
      "Watch",
      "TDS meter scale is not set",
      "TDS cannot be converted reliably because 500-scale and 700-scale meters read differently.",
      "Set the setup meter scale to 500 or 700, or enter EC directly from an EC meter."
    );
  } else if (ec < Number(setup.targetEcMin)) {
    add(
      "Warning",
      "EC is below target",
      "Nutrient strength is low for the selected crop target range.",
      "Add complete hydroponic nutrients gradually, mix thoroughly, and retest EC.",
      "Do not correct by adding only one nutrient unless the deficiency has been verified."
    );
  } else if (ec > Number(setup.targetEcMax)) {
    add(
      "Warning",
      "EC is above target",
      "Nutrient solution is concentrated and may cause water stress or nutrient burn.",
      "Dilute with clean water or replace part of the solution, then retest pH.",
      "After dilution, pH often changes and must be checked again."
    );
  }

  if (!Number.isFinite(waterTemp)) {
    add("Watch", "Missing water temperature", "Root-zone risk cannot be checked.", "Record reservoir temperature weekly.");
  } else if (waterTemp >= 32) {
    add(
      "Critical",
      "Reservoir temperature is very high",
      "Hot water can reduce dissolved oxygen and raise root disease risk.",
      "Shade and insulate the reservoir, improve aeration, increase airflow, and cool during peak heat."
    );
  } else if (waterTemp >= 30) {
    add(
      "Warning",
      "Reservoir temperature is high",
      "Warm water can reduce dissolved oxygen and stress roots.",
      "Shade the tank, avoid direct sun on the reservoir, and improve aeration."
    );
  }

  if (normalVolume > 0 && Number.isFinite(waterVolume) && waterVolume < normalVolume * 0.55) {
    add(
      "Warning",
      "Water volume is low",
      "The reservoir is below the normal operating volume.",
      "Top up with clean water or nutrient solution as appropriate, then retest pH and EC."
    );
  }

  if (["brown", "black"].includes(rootColor) || ["foul", "rotten", "bad"].includes(rootSmell)) {
    add(
      "Critical",
      "Possible root disease or oxygen problem",
      "Dark roots or foul smell can indicate oxygen shortage or root disease.",
      "Check pump and aeration immediately, remove dead roots, clean the system, lower water temperature, and consider replacing solution."
    );
  }

  if (algaeLevel === "heavy") {
    add(
      "Warning",
      "Heavy algae observed",
      "Light reaching the nutrient solution can feed algae and compete for oxygen.",
      "Block light from the reservoir and channels, clean affected surfaces, and inspect roots."
    );
  }

  if (pests.length > 0) {
    add(
      "Warning",
      "Pest signs logged",
      "Visible pest signs can explain leaf holes, curling, or spots.",
      "Inspect leaf undersides, isolate affected plants if practical, and use crop-safe pest control."
    );
  }

  if (symptoms.has("newInterveinalYellowing") && phHigh) {
    add(
      "Warning",
      "Possible iron lockout",
      "New leaves yellowing between veins while pH is high often points to pH-related iron unavailability.",
      "Correct pH first and reassess after 2 to 3 days before adding iron."
    );
  }

  if (symptoms.has("oldInterveinalYellowing")) {
    add(
      "Watch",
      "Possible magnesium deficiency",
      "Older leaves yellowing between veins can indicate magnesium shortage, but pH and EC must be checked first.",
      "Verify pH and EC are in range, then review nutrient formula and Epsom salt history."
    );
  }

  if (symptoms.has("innerTipBurn")) {
    add(
      "Watch",
      "Possible calcium transport issue",
      "Tip burn can happen when calcium movement is limited by heat, airflow, uptake, or EC stress.",
      "Check water temperature, airflow, EC, and water uptake before adding calcium."
    );
  }

  if (recommendations.length === 0) {
    add(
      "Good",
      "Readings are within target",
      "No high-priority imbalance was detected from the logged data.",
      "Continue weekly monitoring and compare photo progress."
    );
  }

  recommendations.sort((a, b) => SEVERITY_SCORE[b.severity] - SEVERITY_SCORE[a.severity]);
  return {
    severity: recommendations[0]?.severity || "Good",
    recommendations
  };
}

export function setupStatus(setup, logs = []) {
  const latest = latestLogForSetup(logs, setup.id);
  if (!latest) {
    return { severity: "Watch", latest: null, nextAction: "Add first weekly log" };
  }
  const result = latest.recommendations?.length
    ? { severity: latest.recommendations[0].severity, recommendations: latest.recommendations }
    : evaluateLog(setup, latest);
  return {
    severity: result.severity,
    latest,
    nextAction: result.recommendations[0]?.recommendedAction || "Monitor next weekly reading"
  };
}

export function computeFinancialSummary(state) {
  const totals = {
    cost: 0,
    revenue: 0,
    harvestKg: 0,
    profit: 0,
    bySetup: {}
  };

  for (const setup of state.setups || []) {
    totals.bySetup[setup.id] = {
      setupId: setup.id,
      name: setup.name,
      cost: 0,
      revenue: 0,
      harvestKg: 0,
      profit: 0
    };
  }

  for (const item of state.costItems || []) {
    const cost = Number(item.totalCost || 0);
    totals.cost += cost;
    if (!totals.bySetup[item.setupId]) {
      totals.bySetup[item.setupId] = { setupId: item.setupId, name: "Unassigned", cost: 0, revenue: 0, harvestKg: 0, profit: 0 };
    }
    totals.bySetup[item.setupId].cost += cost;
  }

  for (const log of state.logs || []) {
    const revenue = Number(log.harvestSalesAmount || 0);
    const harvestKg = Number(log.harvestWeightGrams || 0) / 1000;
    totals.revenue += revenue;
    totals.harvestKg += harvestKg;
    if (!totals.bySetup[log.setupId]) {
      totals.bySetup[log.setupId] = { setupId: log.setupId, name: "Unassigned", cost: 0, revenue: 0, harvestKg: 0, profit: 0 };
    }
    totals.bySetup[log.setupId].revenue += revenue;
    totals.bySetup[log.setupId].harvestKg += harvestKg;
  }

  totals.profit = totals.revenue - totals.cost;
  for (const row of Object.values(totals.bySetup)) {
    row.profit = row.revenue - row.cost;
    row.costPerKg = row.harvestKg > 0 ? row.cost / row.harvestKg : 0;
  }

  totals.costPerKg = totals.harvestKg > 0 ? totals.cost / totals.harvestKg : 0;
  return totals;
}

export function rowsToCsv(rows, columns) {
  const escapeCell = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [
    columns.map((column) => escapeCell(column.header)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCell(row[column.key])).join(","))
  ].join("\r\n");
}

export function exportableRows(state, kind) {
  if (kind === "setups") return state.setups || [];
  if (kind === "logs") {
    return (state.logs || []).map((log) => ({
      ...log,
      symptoms: (log.symptoms || []).join("; "),
      pestSigns: (log.pestSigns || []).join("; "),
      photoCount: (log.photos || []).length
    }));
  }
  if (kind === "recommendations") {
    return (state.logs || []).flatMap((log) =>
      (log.recommendations || []).map((rec) => ({
        logId: log.id,
        setupId: log.setupId,
        date: log.date,
        severity: rec.severity,
        issue: rec.issue,
        likelyCause: rec.likelyCause,
        recommendedAction: rec.recommendedAction,
        warning: rec.warning
      }))
    );
  }
  if (kind === "sensors") return state.sensorReadings || [];
  if (kind === "costs") return state.costItems || [];
  return [];
}

export function csvColumns(kind) {
  const map = {
    setups: ["id", "name", "crop", "systemType", "tankCapacityLiters", "normalWaterVolumeLiters", "tdsScale", "targetPhMin", "targetPhMax", "targetEcMin", "targetEcMax", "targetWaterTempMin", "targetWaterTempMax"],
    logs: ["id", "setupId", "date", "waterVolumeLiters", "ph", "tdsPpm", "ec", "waterTempC", "airTempC", "humidity", "plantHeightCm", "plantCount", "mortalityCount", "harvestWeightGrams", "harvestSalesAmount", "rootColor", "rootSmell", "algaeLevel", "symptoms", "pestSigns", "actionsTaken", "notes", "photoCount"],
    recommendations: ["logId", "setupId", "date", "severity", "issue", "likelyCause", "recommendedAction", "warning"],
    sensors: ["id", "setupId", "dateTime", "ph", "tdsPpm", "ec", "waterTempC", "waterLevelLiters", "source"],
    costs: ["id", "setupId", "date", "category", "description", "quantity", "unit", "totalCost"]
  };
  return (map[kind] || []).map((key) => ({ key, header: key }));
}

export function parseSensorCsv(text, setups = [], fallbackSetupId = "") {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const split = (line) => line.split(",").map((cell) => cell.trim());
  const headers = split(lines[0]).map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const setupByName = new Map(setups.map((setup) => [setup.name.toLowerCase(), setup.id]));

  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
    const setupName = String(row.setup || row.setupname || "").toLowerCase();
    const setupId = row.setupid || setupByName.get(setupName) || fallbackSetupId;
    const tdsScale = setups.find((setup) => setup.id === setupId)?.tdsScale || 500;
    const tdsPpm = Number(row.tds || row.tdsppm || row.ppm || 0);
    const ec = Number(row.ec || 0) || calculateEc(tdsPpm, tdsScale);
    return {
      id: uid("sensor"),
      setupId,
      dateTime: row.datetime || row.date || todayISO(),
      ph: Number(row.ph || 0) || "",
      tdsPpm: tdsPpm || "",
      ec: ec || "",
      waterTempC: Number(row.watertempc || row.temp || row.temperature || 0) || "",
      waterLevelLiters: Number(row.waterlevelliters || row.waterlevel || row.volume || 0) || "",
      source: row.source || "CSV import",
      createdAt: todayISO()
    };
  });
}

export function mergeState(defaultState, savedState) {
  const merged = { ...clone(defaultState), ...(savedState || {}) };
  for (const key of ["setups", "logs", "sensorReadings", "costItems", "reminders"]) {
    if (!Array.isArray(merged[key])) merged[key] = [];
  }
  merged.settings = { ...defaultState.settings, ...(savedState?.settings || {}) };
  merged.version = APP_VERSION;
  return merged;
}
