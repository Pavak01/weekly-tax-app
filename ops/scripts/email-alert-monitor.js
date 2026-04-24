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

  for (const row of rows) {
    if (!row || row.httpStatus !== 401 || !row.timestamp || !row.path) {
      continue;
    }

    const ts = Date.parse(row.timestamp);
    if (!Number.isFinite(ts) || ts < startMs) {
      continue;
    }

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

  return { login401, download401 };
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

  const now = new Date();
  const startMs = now.getTime() - lookbackMinutes * 60 * 1000;
  const startIso = new Date(startMs).toISOString();

  const canary = getEnv("CANARY", "false") === "true";
  let login401, download401, rowCount;

  if (canary) {
    login401 = loginThreshold * 2;
    download401 = downloadThreshold * 2;
    rowCount = 0;
    console.log("canary_mode", JSON.stringify({ injected_login_401: login401, injected_download_401: download401 }));
  } else {
    const rows = runRailwayLogs(service, environment, lines);
    ({ login401, download401 } = countSpike(rows, startMs));
    rowCount = rows.length;
  }

  console.log(
    "monitor_window",
    JSON.stringify({
      now_utc: now.toISOString(),
      window_start_utc: startIso,
      service,
      environment,
      canary,
      rows_fetched: rowCount,
      login_401: login401,
      download_401: download401,
      login_threshold: loginThreshold,
      download_threshold: downloadThreshold
    })
  );

  const breached = login401 >= loginThreshold || download401 >= downloadThreshold;
  if (!breached) {
    console.log("status", "no_alert");
    return;
  }

  const subject = `[weekly-tax-app] 401 spike detected (${environment})${canary ? " [CANARY]" : ""}`;
  const bodyLines = [
    canary ? "CANARY TEST: Synthetic 401 counts injected to verify alert delivery." : "401 spike alert detected.",
    "",
    `Service: ${service}`,
    `Environment: ${environment}`,
  ];
  if (canary) {
    bodyLines.push("Source: canary injection (no real Railway logs fetched)");
  } else {
    bodyLines.push(`Window start (UTC): ${startIso}`, `Window end (UTC): ${now.toISOString()}`);
  }
  bodyLines.push(
    `POST /auth/login 401 count: ${login401}`,
    `GET /receipts/:id/download 401 count: ${download401}`,
    `Thresholds: login>=${loginThreshold}, download>=${downloadThreshold}`,
    "",
    "Source: ops/scripts/email-alert-monitor.js"
  );
  const body = bodyLines.join("\n");

  await sendEmail({ subject, body });
  console.log("status", "alert_sent");
}

main().catch((error) => {
  console.error("monitor_error", error.message);
  process.exit(1);
});
