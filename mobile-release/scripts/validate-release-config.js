const fs = require("fs");
const path = require("path");

const buildProfile = process.argv[2] || "preview";
const projectRoot = path.resolve(__dirname, "..");
const appJsonPath = path.join(projectRoot, "app.json");
const easJsonPath = path.join(projectRoot, "eas.json");
const envPath = path.join(projectRoot, ".env");

const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const easJson = fs.existsSync(easJsonPath) ? JSON.parse(fs.readFileSync(easJsonPath, "utf8")) : {};
const expoConfig = appJson.expo || {};
const buildProfileConfig = easJson.build?.[buildProfile] || {};

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const entries = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['\"]|['\"]$/g, "");
    entries[key] = value;
  }

  return entries;
}

const dotEnv = readDotEnv(envPath);

function resolveApiBaseUrl() {
  const candidates = [
    { source: "process.env", value: process.env.EXPO_PUBLIC_API_BASE_URL },
    { source: `eas.json build.${buildProfile}.env`, value: buildProfileConfig.env?.EXPO_PUBLIC_API_BASE_URL },
    { source: ".env", value: dotEnv.EXPO_PUBLIC_API_BASE_URL },
    { source: "app.json expo.extra", value: expoConfig.extra?.apiBaseUrl }
  ];

  return resolveFirstValue(candidates);
}

function resolveFirstValue(candidates) {

  for (const candidate of candidates) {
    const value = typeof candidate.value === "string" ? candidate.value.trim() : "";
    if (value) {
      return { source: candidate.source, value };
    }
  }

  return { source: "none", value: "" };
}

const resolvedApiBaseUrl = resolveApiBaseUrl();
const apiBaseUrl = resolvedApiBaseUrl.value;
const resolvedBundleIdentifier = resolveFirstValue([
  { source: "process.env", value: process.env.APP_IOS_BUNDLE_IDENTIFIER },
  { source: `eas.json build.${buildProfile}.env`, value: buildProfileConfig.env?.APP_IOS_BUNDLE_IDENTIFIER },
  { source: ".env", value: dotEnv.APP_IOS_BUNDLE_IDENTIFIER },
  { source: "app.json expo.ios", value: expoConfig.ios?.bundleIdentifier }
]);
const resolvedAndroidPackage = resolveFirstValue([
  { source: "process.env", value: process.env.APP_ANDROID_PACKAGE },
  { source: `eas.json build.${buildProfile}.env`, value: buildProfileConfig.env?.APP_ANDROID_PACKAGE },
  { source: ".env", value: dotEnv.APP_ANDROID_PACKAGE },
  { source: "app.json expo.android", value: expoConfig.android?.package }
]);
const bundleIdentifier = resolvedBundleIdentifier.value;
const androidPackage = resolvedAndroidPackage.value;

const errors = [];
const warnings = [];

function isPlaceholderIdentifier(value) {
  return !value || value === "com.weeklytaxapp.mobile" || /^com\.yourcompany\./i.test(value);
}

const looksPlaceholderUrl =
  !apiBaseUrl ||
  /example\.com/i.test(apiBaseUrl) ||
  /localhost/i.test(apiBaseUrl) ||
  /127\.0\.0\.1/.test(apiBaseUrl);

if (looksPlaceholderUrl) {
  errors.push(
    `EXPO_PUBLIC_API_BASE_URL must point to a deployed backend for ${buildProfile} builds. Current value: ${apiBaseUrl || "<empty>"} (source: ${resolvedApiBaseUrl.source})`
  );
}

try {
  const parsedUrl = new URL(apiBaseUrl);
  if (parsedUrl.protocol !== "https:") {
    warnings.push("EXPO_PUBLIC_API_BASE_URL is not using HTTPS.");
  }
} catch {
  if (!looksPlaceholderUrl) {
    errors.push(`EXPO_PUBLIC_API_BASE_URL is not a valid URL: ${apiBaseUrl}`);
  }
}

if (isPlaceholderIdentifier(bundleIdentifier)) {
  const message = `iOS bundle identifier is still using a placeholder value: ${bundleIdentifier || "<empty>"}.`;
  if (buildProfile === "production") {
    errors.push(message);
  } else {
    warnings.push(message);
  }
}

if (isPlaceholderIdentifier(androidPackage)) {
  const message = `Android package name is still using a placeholder value: ${androidPackage || "<empty>"}.`;
  if (buildProfile === "production") {
    errors.push(message);
  } else {
    warnings.push(message);
  }
}

if (errors.length > 0) {
  console.error("Release configuration validation failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }

  if (warnings.length > 0) {
    console.error("\nWarnings:");
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }

  process.exit(1);
}

console.log(`Release configuration validation passed for ${buildProfile}.`);
console.log(`Resolved EXPO_PUBLIC_API_BASE_URL from ${resolvedApiBaseUrl.source}: ${apiBaseUrl}`);
console.log(`Resolved APP_IOS_BUNDLE_IDENTIFIER from ${resolvedBundleIdentifier.source}: ${bundleIdentifier}`);
console.log(`Resolved APP_ANDROID_PACKAGE from ${resolvedAndroidPackage.source}: ${androidPackage}`);

if (warnings.length > 0) {
  console.warn("Warnings:");
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}