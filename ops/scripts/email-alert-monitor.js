#!/usr/bin/env node

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function getEnv(name, fallback = "") {
  const value = process.env[name];
  return value === undefined || value === null || value === "" ? fallback : value;
}

function parseIntEnv(name, fallback) {
  const raw = getEnv(name, String(fallback));
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${raw}`);
  }
  return parsed;
}

function parseBoolEnv(name, fallback = false) {
  const value = getEnv(name, fallback ? "true" : "false").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function normalizeEnvValue(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return "";
  }

  // Secrets are sometimes pasted with wrapping quotes; strip one pair.
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function isSimpleEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isNamedEmail(value) {
  return /^[^<>]+<\s*[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+\s*>$/.test(value);
}

function validateEmailEnv(name, allowDisplayName = false) {
  const normalized = normalizeEnvValue(getEnv(name));
  if (!normalized) {
    throw new Error(`Missing required email env var: ${name}`);
  }

  const valid = allowDisplayName
    ? isSimpleEmail(normalized) || isNamedEmail(normalized)
    : isSimpleEmail(normalized);

  if (!valid) {
    const allowed = allowDisplayName
      ? "email@example.com or Name <email@example.com>"
      : "email@example.com";
    throw new Error(`Invalid ${name} format. Expected: ${allowed}`);
  }

  return normalized;
}

function runRailwayLogs(service, environment, lines) {
  const command = [
    "npx",
    "--yes",
    "@railway/cli",
    "logs",
    "--http",
    "--json",
    "--service",
    service,
    "--environment",
    environment,
    "--lines",
    String(lines)
  ].join(" ");

  const output = execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();

  if (!output) {
    return [];
  }

  return output
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function defaultState() {
  return {
    lastAlertSentAt: null,
    lastEscalationSentAt: null,
    lastBreachAt: null,
    consecutiveBreaches: 0,
    stats: {
      sent: 0,
      noAlert: 0,
      suppressedStale: 0,
      suppressedCooldown: 0,
      escalationsSent: 0,
      errors: 0
    },
    sentMessages: []
  };
}

function loadState(stateFile) {
  if (!fs.existsSync(stateFile)) {
    return defaultState();
  }

  const raw = fs.readFileSync(stateFile, "utf8");
  const parsed = safeJsonParse(raw, null);
  if (!parsed || typeof parsed !== "object") {
    return defaultState();
  }

  return {
    ...defaultState(),
    ...parsed,
    stats: {
      ...defaultState().stats,
      ...(parsed.stats || {})
    },
    sentMessages: Array.isArray(parsed.sentMessages) ? parsed.sentMessages : []
  };
}

function saveState(stateFile, state) {
  ensureDirForFile(stateFile);
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function trimMessageHistory(state, maxItems = 100) {
  if (state.sentMessages.length > maxItems) {
    state.sentMessages = state.sentMessages.slice(-maxItems);
  }
}

function recordSentMessage(state, entry) {
  state.sentMessages.push(entry);
  trimMessageHistory(state);
}

async function resendApiRequest(resendApiKey, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  const bodyText = await response.text();
  const bodyJson = safeJsonParse(bodyText, null);

  if (!response.ok) {
    const body = bodyJson ? JSON.stringify(bodyJson) : bodyText;
    throw new Error(`Resend API error (${response.status}): ${body}`);
  }

  return bodyJson || {};
}

async function refreshDeliveryState(resendApiKey, state) {
  const unknownStatuses = new Set(["sent", "queued", "unknown", "processing"]);

  for (const message of state.sentMessages) {
    if (!message || !message.id || !unknownStatuses.has(message.status || "unknown")) {
      continue;
    }

    try {
      const details = await resendApiRequest(
        resendApiKey,
        `https://api.resend.com/emails/${message.id}`,
        { method: "GET" }
      );

      // Resend response shape may evolve; probe common keys defensively.
      const status =
        details.last_event ||
        details.status ||
        details.email?.last_event ||
        details.data?.last_event ||
        details.data?.status ||
        "unknown";
      message.status = String(status).toLowerCase();
      message.lastCheckedAt = new Date().toISOString();
    } catch {
      // Do not fail monitor execution if delivery lookup is temporarily unavailable.
      message.lastCheckedAt = new Date().toISOString();
    }
  }
}

function summarizeDeliverySlo(state, lookbackHours) {
  const sinceMs = Date.now() - lookbackHours * 60 * 60 * 1000;
  const recent = state.sentMessages.filter((message) => {
    const ts = Date.parse(message.createdAt || "");
    return Number.isFinite(ts) && ts >= sinceMs;
  });

  const counters = {
    sent: recent.length,
    delivered: 0,
    bounced: 0,
    complained: 0,
    pending: 0,
    unknown: 0
  };

  for (const message of recent) {
    const status = (message.status || "unknown").toLowerCase();
    if (status === "delivered") {
      counters.delivered += 1;
    } else if (status.includes("bounce")) {
      counters.bounced += 1;
    } else if (status.includes("complain")) {
      counters.complained += 1;
    } else if (status === "sent" || status === "queued" || status === "processing") {
      counters.pending += 1;
    } else {
      counters.unknown += 1;
    }
  }

  const resolved = counters.delivered + counters.bounced + counters.complained;
  const deliveryRate = resolved > 0 ? counters.delivered / resolved : null;

  return {
    lookback_hours: lookbackHours,
    ...counters,
    delivery_rate: deliveryRate
  };
}

function countSpike(rows, startMs) {
  let login401 = 0;
  let download401 = 0;
  let matchedEvents = 0;
  let latestMatchedTs = 0;

  for (const row of rows) {
    if (!row || row.httpStatus !== 401 || !row.timestamp || !row.path) {
      continue;
    }

    const ts = Date.parse(row.timestamp);
    if (!Number.isFinite(ts) || ts < startMs) {
      continue;
    }

    matchedEvents += 1;
    latestMatchedTs = Math.max(latestMatchedTs, ts);

    if (row.method === "POST" && row.path === "/auth/login") {
      login401 += 1;
      continue;
    }

    if (
      row.method === "GET" &&
      row.path.startsWith("/receipts/") &&
      row.path.endsWith("/download")
    ) {
      download401 += 1;
    }
  }

  return { login401, download401, matchedEvents, latestMatchedTs };
}

async function sendEmail(payload) {
  const resendApiKey = getEnv("RESEND_API_KEY");
  const from = validateEmailEnv("ALERT_FROM_EMAIL", true);
  const to = validateEmailEnv(payload.toEnv || "ALERT_TO_EMAIL", false);
  const dryRun = getEnv("DRY_RUN", "false") === "true";

  if (!resendApiKey) {
    throw new Error("Missing required env var: RESEND_API_KEY");
  }

  if (dryRun) {
    console.log("dry_run_email_payload", JSON.stringify(payload));
    return { id: "dry-run" };
  }

  const result = await resendApiRequest(resendApiKey, "https://api.resend.com/emails", {
    method: "POST",
    body: JSON.stringify({
      from,
      to: [to],
      subject: payload.subject,
      text: payload.body
    })
  });

  console.log("email_sent", JSON.stringify(result));
  return {
    id: result.id || null,
    to,
    subject: payload.subject
  };
}

async function main() {
  const service = getEnv("RAILWAY_SERVICE", "weekly-tax-app");
  const environment = getEnv("RAILWAY_ENVIRONMENT", "production");
  const lookbackMinutes = parseIntEnv("LOOKBACK_MINUTES", 5);
  const lines = parseIntEnv("LOG_LINES", 800);
  const loginThreshold = parseIntEnv("LOGIN_401_THRESHOLD", 20);
  const downloadThreshold = parseIntEnv("DOWNLOAD_401_THRESHOLD", 6);
  const maxEventAgeSeconds = parseIntEnv("MAX_EVENT_AGE_SECONDS", 240);
  const cooldownSeconds = parseIntEnv("ALERT_COOLDOWN_SECONDS", 1800);
  const breachResetSeconds = parseIntEnv("ALERT_BREACH_RESET_SECONDS", 3600);
  const escalationThreshold = parseIntEnv("ESCALATION_CONSECUTIVE_BREACHES", 3);
  const escalationCooldownSeconds = parseIntEnv("ESCALATION_COOLDOWN_SECONDS", 3600);
  const stateFile = getEnv("ALERT_STATE_FILE", ".alert-state/monitor-state.json");
  const sloLookbackHours = parseIntEnv("SLO_LOOKBACK_HOURS", 24);
  const escalationEnabled = parseBoolEnv("ENABLE_ESCALATION", true);

  const state = loadState(stateFile);
  const resendApiKey = getEnv("RESEND_API_KEY");

  const now = new Date();
  const nowMs = now.getTime();
  const startMs = now.getTime() - lookbackMinutes * 60 * 1000;
  const startIso = new Date(startMs).toISOString();

  const rows = runRailwayLogs(service, environment, lines);
  const { login401, download401, matchedEvents, latestMatchedTs } = countSpike(rows, startMs);
  const latestMatchedIso = latestMatchedTs > 0 ? new Date(latestMatchedTs).toISOString() : null;
  const latestEventAgeSeconds =
    latestMatchedTs > 0 ? Math.floor((now.getTime() - latestMatchedTs) / 1000) : null;

  console.log(
    "monitor_window",
    JSON.stringify({
      now_utc: now.toISOString(),
      window_start_utc: startIso,
      service,
      environment,
      rows_fetched: rows.length,
      matched_401_events: matchedEvents,
      login_401: login401,
      download_401: download401,
      login_threshold: loginThreshold,
      download_threshold: downloadThreshold,
      latest_matched_event_utc: latestMatchedIso,
      latest_event_age_seconds: latestEventAgeSeconds,
      max_event_age_seconds: maxEventAgeSeconds,
      cooldown_seconds: cooldownSeconds,
      consecutive_breaches: state.consecutiveBreaches,
      state_file: stateFile
    })
  );

  const breached = login401 >= loginThreshold || download401 >= downloadThreshold;
  if (!breached) {
    state.stats.noAlert += 1;
    if (state.lastBreachAt) {
      const lastBreachMs = Date.parse(state.lastBreachAt);
      if (Number.isFinite(lastBreachMs) && nowMs - lastBreachMs > breachResetSeconds * 1000) {
        state.consecutiveBreaches = 0;
      }
    }
    if (resendApiKey) {
      await refreshDeliveryState(resendApiKey, state);
      console.log("delivery_slo", JSON.stringify(summarizeDeliverySlo(state, sloLookbackHours)));
    }
    saveState(stateFile, state);
    console.log("status", "no_alert");
    return;
  }

  const lastBreachMs = Date.parse(state.lastBreachAt || "");
  if (Number.isFinite(lastBreachMs) && nowMs - lastBreachMs <= breachResetSeconds * 1000) {
    state.consecutiveBreaches += 1;
  } else {
    state.consecutiveBreaches = 1;
  }
  state.lastBreachAt = now.toISOString();

  if (latestEventAgeSeconds === null || latestEventAgeSeconds > maxEventAgeSeconds) {
    state.stats.suppressedStale += 1;
    if (resendApiKey) {
      await refreshDeliveryState(resendApiKey, state);
      console.log("delivery_slo", JSON.stringify(summarizeDeliverySlo(state, sloLookbackHours)));
    }
    saveState(stateFile, state);
    console.log("status", "suppressed_stale_event");
    return;
  }

  const lastAlertMs = Date.parse(state.lastAlertSentAt || "");
  if (Number.isFinite(lastAlertMs) && nowMs - lastAlertMs < cooldownSeconds * 1000) {
    state.stats.suppressedCooldown += 1;
    if (resendApiKey) {
      await refreshDeliveryState(resendApiKey, state);
      console.log("delivery_slo", JSON.stringify(summarizeDeliverySlo(state, sloLookbackHours)));
    }
    saveState(stateFile, state);
    console.log("status", "suppressed_cooldown");
    return;
  }

  const subject = `[weekly-tax-app] 401 spike detected (${environment})`;
  const body = [
    "401 spike alert detected.",
    "",
    `Service: ${service}`,
    `Environment: ${environment}`,
    `Window start (UTC): ${startIso}`,
    `Window end (UTC): ${now.toISOString()}`,
    `Latest matched 401 event (UTC): ${latestMatchedIso}`,
    `Latest event age (seconds): ${latestEventAgeSeconds}`,
    `POST /auth/login 401 count: ${login401}`,
    `GET /receipts/:id/download 401 count: ${download401}`,
    `Thresholds: login>=${loginThreshold}, download>=${downloadThreshold}`,
    "",
    "Source: ops/scripts/email-alert-monitor.js"
  ].join("\n");

  const primaryResult = await sendEmail({ subject, body, toEnv: "ALERT_TO_EMAIL" });
  state.lastAlertSentAt = now.toISOString();
  state.stats.sent += 1;
  recordSentMessage(state, {
    id: primaryResult.id,
    to: primaryResult.to,
    subject: primaryResult.subject,
    status: "sent",
    createdAt: now.toISOString(),
    type: "primary"
  });

  if (escalationEnabled && getEnv("ALERT_ESCALATION_TO_EMAIL")) {
    const lastEscalationMs = Date.parse(state.lastEscalationSentAt || "");
    const escalationCooldownElapsed =
      !Number.isFinite(lastEscalationMs) || nowMs - lastEscalationMs >= escalationCooldownSeconds * 1000;

    if (state.consecutiveBreaches >= escalationThreshold && escalationCooldownElapsed) {
      const escalationSubject = `[weekly-tax-app][ESCALATION] repeated 401 spikes (${environment})`;
      const escalationBody = [
        "Escalation: repeated 401 spike condition persisted.",
        "",
        `Consecutive breach windows: ${state.consecutiveBreaches}`,
        `Escalation threshold: ${escalationThreshold}`,
        `Service: ${service}`,
        `Environment: ${environment}`,
        `Latest matched 401 event (UTC): ${latestMatchedIso}`,
        `Latest event age (seconds): ${latestEventAgeSeconds}`,
        `Primary alert sent at (UTC): ${now.toISOString()}`,
        "",
        "Source: ops/scripts/email-alert-monitor.js"
      ].join("\n");

      const escalationResult = await sendEmail({
        subject: escalationSubject,
        body: escalationBody,
        toEnv: "ALERT_ESCALATION_TO_EMAIL"
      });

      state.lastEscalationSentAt = now.toISOString();
      state.stats.escalationsSent += 1;
      recordSentMessage(state, {
        id: escalationResult.id,
        to: escalationResult.to,
        subject: escalationResult.subject,
        status: "sent",
        createdAt: now.toISOString(),
        type: "escalation"
      });
      console.log("escalation", "sent");
    }
  }

  if (resendApiKey) {
    await refreshDeliveryState(resendApiKey, state);
    console.log("delivery_slo", JSON.stringify(summarizeDeliverySlo(state, sloLookbackHours)));
  }

  saveState(stateFile, state);
  console.log("status", "alert_sent");
}

main().catch((error) => {
  try {
    const stateFile = getEnv("ALERT_STATE_FILE", ".alert-state/monitor-state.json");
    const state = loadState(stateFile);
    state.stats.errors += 1;
    saveState(stateFile, state);
  } catch {
    // Ignore state write failures while handling fatal errors.
  }
  console.error("monitor_error", error.message);
  process.exit(1);
});
