#!/usr/bin/env node

const { execSync } = require("node:child_process");

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
  const from = getEnv("ALERT_FROM_EMAIL");
  const to = getEnv("ALERT_TO_EMAIL");
  const dryRun = getEnv("DRY_RUN", "false") === "true";

  if (!resendApiKey || !from || !to) {
    throw new Error("Missing one or more required email env vars: RESEND_API_KEY, ALERT_FROM_EMAIL, ALERT_TO_EMAIL");
  }

  if (dryRun) {
    console.log("dry_run_email_payload", JSON.stringify(payload));
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: payload.subject,
      text: payload.body
    })
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Resend API error (${response.status}): ${body}`);
  }

  console.log("email_sent", body);
}

async function main() {
  const service = getEnv("RAILWAY_SERVICE", "weekly-tax-app");
  const environment = getEnv("RAILWAY_ENVIRONMENT", "production");
  const lookbackMinutes = parseIntEnv("LOOKBACK_MINUTES", 5);
  const lines = parseIntEnv("LOG_LINES", 800);
  const loginThreshold = parseIntEnv("LOGIN_401_THRESHOLD", 20);
  const downloadThreshold = parseIntEnv("DOWNLOAD_401_THRESHOLD", 6);
  const maxEventAgeSeconds = parseIntEnv("MAX_EVENT_AGE_SECONDS", 240);

  const now = new Date();
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
      max_event_age_seconds: maxEventAgeSeconds
    })
  );

  const breached = login401 >= loginThreshold || download401 >= downloadThreshold;
  if (!breached) {
    console.log("status", "no_alert");
    return;
  }

  if (latestEventAgeSeconds === null || latestEventAgeSeconds > maxEventAgeSeconds) {
    console.log("status", "suppressed_stale_event");
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

  await sendEmail({ subject, body });
  console.log("status", "alert_sent");
}

main().catch((error) => {
  console.error("monitor_error", error.message);
  process.exit(1);
});
