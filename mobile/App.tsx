import React, { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { AppHeader } from "./src/components/AppHeader";
import { Card, Field, PreviewPill, SmallAction, StatusBanner, SummaryRow } from "./src/components/Controls";
import { SnapshotCard } from "./src/components/SnapshotCard";
import { FormSection } from "./src/components/FormSection";
import { SettingsScreen } from "./src/components/SettingsScreen";
import { colors, motion, radius, spacing, typography } from "./src/theme/tokens";

const runtimeApiBaseUrl = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  ?.EXPO_PUBLIC_API_BASE_URL;
const API_BASE_URL = runtimeApiBaseUrl || "http://localhost:4000";
const QUICK_STATE_KEY = "weekly-tax-app:quick-state:v1";
const AUTH_STATE_KEY = "weekly-tax-app:auth-state:v1";

type Screen = "week" | "summary" | "audit" | "export" | "admin" | "guide" | "settings";
type EntryMode = "weekly" | "monthly" | "daily";

type AuthUser = {
  id: string;
  email: string;
  role?: string;
};

type TwoFactorStatusResponse = {
  enabled: boolean;
  pending_setup: boolean;
};

type ReceiptRecord = {
  id: string;
  weekly_entry_id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number;
  created_at: string;
  download_url?: string;
};

type EntryModeLock = {
  locked: boolean;
  locked_mode?: EntryMode;
  week_start_date: string;
  existing_entry_dates?: string[];
};

type RuleMonitoringResponse = {
  monitored_at: string;
  tax_year: string;
  active_rule_set: {
    id: string;
    version: number;
    effective_from: string;
    effective_to: string | null;
    source_reference: string | null;
    notes: string | null;
    created_by: string | null;
  };
  available_versions: number[];
  review: {
    status: "ok" | "review";
    checked_at: string;
    message: string;
    signals: string[];
    source_reference: string | null;
  };
};

type RuleAuditEvent = {
  id: string;
  tax_year: string;
  rule_set_id: string | null;
  event_type: string;
  event_payload: unknown;
  performed_by: string | null;
  performed_at: string;
};

type AuditReceipt = {
  id: string;
  weekly_entry_id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number;
  created_at: string;
  download_url: string;
};

type AuditEntry = {
  id: string;
  week_start_date: string;
  entry_date: string | null;
  entry_mode: string;
  income_total: number;
  total_expenses: number;
  net_profit: number;
  company_providing_services_for: string | null;
  created_at: string;
  receipts: AuditReceipt[];
};

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>("week");

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register" | "reset" | "verify2fa">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetCodePreview, setResetCodePreview] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState<string | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorSetupKey, setTwoFactorSetupKey] = useState<string | null>(null);
  const [twoFactorSetupUri, setTwoFactorSetupUri] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [isLoadingTwoFactor, setIsLoadingTwoFactor] = useState(false);

  const [entryMode, setEntryMode] = useState<EntryMode>("weekly");
  const [entryDate, setEntryDate] = useState(getTodayDisplayDate());
  const [weekStartDate, setWeekStartDate] = useState(getCurrentMondayDisplayDate());
  const [modeLock, setModeLock] = useState<EntryModeLock | null>(null);
  const [serviceCompany, setServiceCompany] = useState("");
  const [income, setIncome] = useState("950");

  const [fuel, setFuel] = useState("0");
  const [fuelReimbursed, setFuelReimbursed] = useState("0");
  const [travel, setTravel] = useState("40");
  const [travelReimbursed, setTravelReimbursed] = useState("10");
  const [food, setFood] = useState("0");
  const [foodReimbursed, setFoodReimbursed] = useState("0");
  const [other, setOther] = useState("0");
  const [otherReimbursed, setOtherReimbursed] = useState("0");

  const [setAside, setSetAside] = useState<number | null>(null);
  const [estimatedTax, setEstimatedTax] = useState<number | null>(null);

  const [taxYear, setTaxYear] = useState("2026-27");
  const [summaryAsOfDate, setSummaryAsOfDate] = useState(getTodayDisplayDate());
  const [summary, setSummary] = useState<null | {
    as_of_date: string;
    weeks_logged: number;
    total_income: number;
    total_expenses: number;
    net_profit: number;
    estimated_income_tax: number;
    estimated_ni: number;
    weekly_breakdown: Array<{
      period_start: string;
      period_label: string;
      entries_logged: number;
      total_income: number;
      total_expenses: number;
      net_profit: number;
    }>;
    monthly_breakdown: Array<{
      month: string;
      month_label: string;
      entries_logged: number;
      total_income: number;
      total_expenses: number;
      net_profit: number;
    }>;
    updated_at?: string | null;
  }>(null);

  const [exportData, setExportData] = useState<string>("");
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [currentWeekId, setCurrentWeekId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);

  const [isSavingWeek, setIsSavingWeek] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [isLoadingExport, setIsLoadingExport] = useState(false);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [isLoadingReceipts, setIsLoadingReceipts] = useState(false);
  const [isLoadingMonitoring, setIsLoadingMonitoring] = useState(false);
  const [isLoadingAuditEvents, setIsLoadingAuditEvents] = useState(false);
  const [isPublishingRule, setIsPublishingRule] = useState(false);
  const [openingReceiptId, setOpeningReceiptId] = useState<string | null>(null);
  const [isBootstrappingState, setIsBootstrappingState] = useState(true);

  const [rulePublishSecretInput, setRulePublishSecretInput] = useState("");
  const [monitoringData, setMonitoringData] = useState<RuleMonitoringResponse | null>(null);
  const [auditEvents, setAuditEvents] = useState<RuleAuditEvent[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [publishEffectiveFrom, setPublishEffectiveFrom] = useState(getCurrentMondayDisplayDate());
  const [publishSourceReference, setPublishSourceReference] = useState(
    "https://www.gov.uk/self-employed-national-insurance-rates"
  );
  const [publishNotes, setPublishNotes] = useState("Published from mobile admin tooling");
  const [publishPersonalAllowance, setPublishPersonalAllowance] = useState("12570");
  const [publishBasicRateLimit, setPublishBasicRateLimit] = useState("37700");
  const [publishBasicRate, setPublishBasicRate] = useState("0.2");
  const [publishHigherRate, setPublishHigherRate] = useState("0.4");
  const [publishNiClass2Weekly, setPublishNiClass2Weekly] = useState("3.45");
  const [publishNiClass4Threshold, setPublishNiClass4Threshold] = useState("12570");
  const [publishNiClass4Rate, setPublishNiClass4Rate] = useState("0.09");
  const [adminTargetEmail, setAdminTargetEmail] = useState("");
  const [adminTargetRole, setAdminTargetRole] = useState<"admin" | "user">("admin");
  const [isUpdatingUserRole, setIsUpdatingUserRole] = useState(false);

  const contentOpacity = useRef(new Animated.Value(1)).current;
  const statusPulse = useRef(new Animated.Value(1)).current;
  const sessionExpiryNoticeShown = useRef(false);
  const canUseNativeDriver = Platform.OS !== "web";

  const expenses = useMemo(
    () => [
      { category: "fuel", total_amount: Number(fuel || 0), reimbursed_amount: Number(fuelReimbursed || 0) },
      { category: "travel", total_amount: Number(travel || 0), reimbursed_amount: Number(travelReimbursed || 0) },
      { category: "food", total_amount: Number(food || 0), reimbursed_amount: Number(foodReimbursed || 0) },
      { category: "other", total_amount: Number(other || 0), reimbursed_amount: Number(otherReimbursed || 0) }
    ],
    [fuel, fuelReimbursed, travel, travelReimbursed, food, foodReimbursed, other, otherReimbursed]
  );

  const expensePreview = useMemo(() => {
    const totalGross = expenses.reduce((sum, item) => sum + item.total_amount, 0);
    const totalClaimable = expenses.reduce(
      (sum, item) => sum + Math.max(0, item.total_amount - item.reimbursed_amount),
      0
    );
    const totalReimbursed = expenses.reduce((sum, item) => sum + item.reimbursed_amount, 0);
    const profit = Number(income || 0) - totalClaimable;

    return {
      totalGross,
      totalClaimable,
      totalReimbursed,
      profit
    };
  }, [expenses, income]);

  const roundedSetAside = useMemo(() => {
    if (setAside === null) {
      return "-";
    }
    return `£${setAside.toFixed(2)}`;
  }, [setAside]);

  const roundedTax = useMemo(() => {
    if (estimatedTax === null) {
      return "-";
    }
    return `£${estimatedTax.toFixed(2)}`;
  }, [estimatedTax]);

  const resolvedWeekStart = useMemo(
    () =>
      entryMode === "monthly"
        ? getMonthStartFromDate(entryDate)
        : entryMode === "daily"
          ? getWeekStartFromDate(entryDate)
          : weekStartDate,
    [entryDate, entryMode, weekStartDate]
  );
  const canGoToNextWeek = useMemo(() => {
    if (entryMode === "monthly") {
      const entryDateIso = parseDisplayDateToIso(entryDate);
      return !!entryDateIso && entryDateIso < getTodayIsoDate();
    }

    if (entryMode === "daily") {
      const entryDateIso = parseDisplayDateToIso(entryDate);
      return !!entryDateIso && entryDateIso < getTodayIsoDate();
    }

    const weekStartDateIso = parseDisplayDateToIso(weekStartDate);
    const currentWeekStartDateIso = parseDisplayDateToIso(getCurrentMondayDisplayDate());
    return !!weekStartDateIso && !!currentWeekStartDateIso && weekStartDateIso < currentWeekStartDateIso;
  }, [entryDate, entryMode, weekStartDate]);

  const isAdmin = authUser?.role === "admin";

  useEffect(() => {
    if (!isAdmin && screen === "admin") {
      setScreen("week");
    }
  }, [isAdmin, screen]);

  useEffect(() => {
    if (authToken && authUser) {
      void validateSession();
      void fetchTwoFactorStatus();
    } else {
      setTwoFactorEnabled(false);
      setTwoFactorSetupKey(null);
      setTwoFactorSetupUri(null);
      setTwoFactorChallengeToken(null);
      setTwoFactorCode("");
    }
  }, [authToken, authUser]);

  useEffect(() => {
    const resolvedWeekStartIso = parseDisplayDateToIso(resolvedWeekStart);

    if (!authUser || !authToken || !resolvedWeekStartIso) {
      setModeLock(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await authedFetch(`/entry-mode-lock/${resolvedWeekStartIso}`);
        const payload = (await response.json()) as EntryModeLock & { error?: string };

        if (!response.ok || cancelled) {
          return;
        }

        const lockedMode = normalizeEntryMode(payload.locked_mode);
        const normalizedPayload: EntryModeLock = {
          locked: Boolean(payload.locked),
          locked_mode: lockedMode ?? undefined,
          week_start_date: String(payload.week_start_date ?? resolvedWeekStartIso),
          existing_entry_dates: Array.isArray(payload.existing_entry_dates)
            ? payload.existing_entry_dates.map((value) => String(value))
            : []
        };

        setModeLock(normalizedPayload);

        if (normalizedPayload.locked && normalizedPayload.locked_mode && normalizedPayload.locked_mode !== entryMode) {
          setEntryMode(normalizedPayload.locked_mode);
          setStatus({
            kind: "info",
            text: `This period is already locked to ${normalizedPayload.locked_mode} mode.`
          });
        }
      } catch {
        if (!cancelled) {
          setModeLock(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authToken, authUser, entryMode, resolvedWeekStart]);

  useEffect(() => {
    void (async () => {
      try {
        const [quickRaw, authRaw] = await Promise.all([
          AsyncStorage.getItem(QUICK_STATE_KEY),
          AsyncStorage.getItem(AUTH_STATE_KEY)
        ]);

        if (quickRaw) {
          const quick = JSON.parse(quickRaw) as {
            taxYear?: string;
            summaryAsOfDate?: string;
            weekStartDate?: string;
            entryMode?: string;
            entryDate?: string;
            serviceCompany?: string;
          };

          if (quick.taxYear) {
            setTaxYear(quick.taxYear);
          }
          if (quick.summaryAsOfDate) {
            setSummaryAsOfDate(normalizeStoredDate(quick.summaryAsOfDate, getTodayDisplayDate()));
          }
          if (quick.weekStartDate) {
            setWeekStartDate(normalizeStoredDate(quick.weekStartDate, getCurrentMondayDisplayDate()));
          }
          const restoredEntryMode = normalizeEntryMode(quick.entryMode);
          if (restoredEntryMode) {
            setEntryMode(restoredEntryMode);
          }
          if (quick.entryDate) {
            setEntryDate(normalizeStoredDate(quick.entryDate, getTodayDisplayDate()));
          }
          if (quick.serviceCompany) {
            setServiceCompany(quick.serviceCompany);
          }
        }

        if (authRaw) {
          const auth = JSON.parse(authRaw) as {
            token?: string;
            user?: AuthUser;
          };

          if (auth.token && auth.user) {
            let canRestoreSession = true;

            try {
              const response = await fetch(`${API_BASE_URL}/auth/me`, {
                headers: {
                  Authorization: `Bearer ${auth.token}`
                }
              });

              if (response.status === 401) {
                canRestoreSession = false;
                await AsyncStorage.removeItem(AUTH_STATE_KEY);
                setAuthEmail(auth.user.email);
                setStatus({ kind: "error", text: "Your saved session expired. Please sign in again." });
              }
            } catch {
              canRestoreSession = true;
            }

            if (canRestoreSession) {
              setAuthToken(auth.token);
              setAuthUser(auth.user);
              setStatus({ kind: "info", text: `Welcome back, ${auth.user.email}.` });
            }
          }
        }
      } catch {
        setStatus({ kind: "error", text: "Could not restore saved state." });
      } finally {
        setIsBootstrappingState(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (isBootstrappingState) {
      return;
    }

    const timeoutId = setTimeout(() => {
      void AsyncStorage.setItem(
        QUICK_STATE_KEY,
        JSON.stringify({ taxYear, summaryAsOfDate, weekStartDate, entryMode, entryDate, serviceCompany })
      );
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [isBootstrappingState, taxYear, summaryAsOfDate, weekStartDate, entryMode, entryDate, serviceCompany]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(contentOpacity, {
        toValue: 0.78,
        duration: motion.quick,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: canUseNativeDriver
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: motion.normal,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: canUseNativeDriver
      })
    ]).start();
  }, [contentOpacity, screen]);

  useEffect(() => {
    if (!status) {
      return;
    }

    Animated.sequence([
      Animated.timing(statusPulse, {
        toValue: 1.03,
        duration: motion.pulseIn,
        useNativeDriver: canUseNativeDriver
      }),
      Animated.timing(statusPulse, {
        toValue: 1,
        duration: motion.pulseOut,
        useNativeDriver: canUseNativeDriver
      })
    ]).start();
  }, [status, statusPulse]);

  function pad2(value: number): string {
    return String(value).padStart(2, "0");
  }

  function getTodayIsoDate(): string {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }

  function formatIsoToDisplayDate(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const [year, month, day] = value.split("-");
    return `${day}-${month}-${year}`;
  }

  function getTodayDisplayDate(): string {
    return formatIsoToDisplayDate(getTodayIsoDate());
  }

  function getCurrentMonthStartDisplayDate(): string {
    const now = new Date();
    now.setUTCDate(1);
    return formatIsoToDisplayDate(now.toISOString().slice(0, 10));
  }

  function getCurrentMondayDisplayDate(): string {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const offset = utcDay === 0 ? -6 : 1 - utcDay;
    now.setUTCDate(now.getUTCDate() + offset);
    return formatIsoToDisplayDate(now.toISOString().slice(0, 10));
  }

  function parseDisplayDateToIso(value: string): string | null {
    const trimmed = value.trim();

    let year = 0;
    let month = 0;
    let day = 0;

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      [year, month, day] = trimmed.split("-").map(Number);
    } else if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
      const [displayDay, displayMonth, displayYear] = trimmed.split("-").map(Number);
      day = displayDay;
      month = displayMonth;
      year = displayYear;
    } else {
      return null;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  function normalizeDateInput(value: string): string {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return formatIsoToDisplayDate(trimmed);
    }

    const digits = trimmed.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) {
      return digits;
    }
    if (digits.length <= 4) {
      return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
  }

  function normalizeStoredDate(value: string, fallback: string): string {
    const isoDate = parseDisplayDateToIso(value);
    if (!isoDate) {
      return fallback;
    }

    return formatIsoToDisplayDate(isoDate > getTodayIsoDate() ? getTodayIsoDate() : isoDate);
  }

  function formatAuditTimestamp(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function getWeekStartFromDate(value: string): string {
    const isoDate = parseDisplayDateToIso(value);
    if (!isoDate) {
      return value;
    }

    const date = new Date(`${isoDate}T00:00:00Z`);
    const utcDay = date.getUTCDay();
    const offset = utcDay === 0 ? -6 : 1 - utcDay;
    date.setUTCDate(date.getUTCDate() + offset);
    return formatIsoToDisplayDate(date.toISOString().slice(0, 10));
  }

  function getMonthStartFromDate(value: string): string {
    const isoDate = parseDisplayDateToIso(value);
    if (!isoDate) {
      return value;
    }

    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(1);
    return formatIsoToDisplayDate(date.toISOString().slice(0, 10));
  }

  function addDaysToDisplayDate(value: string, days: number): string {
    const isoDate = parseDisplayDateToIso(value);
    if (!isoDate) {
      return value;
    }

    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return formatIsoToDisplayDate(date.toISOString().slice(0, 10));
  }

  function addMonthsToDisplayDate(value: string, months: number): string {
    const isoDate = parseDisplayDateToIso(value);
    if (!isoDate) {
      return value;
    }

    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    return formatIsoToDisplayDate(date.toISOString().slice(0, 10));
  }

  function normalizeEntryMode(value: unknown): EntryMode | null {
    if (value === "weekly") {
      return "weekly";
    }

    if (value === "monthly") {
      return "monthly";
    }

    if (value === "daily") {
      return "daily";
    }

    return null;
  }

  function handleEntryModeChange(nextMode: EntryMode): void {
    if (modeLock?.locked && modeLock.locked_mode && modeLock.locked_mode !== nextMode) {
      Alert.alert(
        "Period locked",
        `This period is already using ${modeLock.locked_mode} mode. The same mode will remain in effect until the next period.`
      );
      setEntryMode(modeLock.locked_mode);
      setStatus({ kind: "info", text: `This period is locked to ${modeLock.locked_mode} mode.` });
      return;
    }

    setEntryMode(nextMode);
  }

  function setThisMonday(): void {
    handleEntryModeChange("weekly");
    setWeekStartDate(getCurrentMondayDisplayDate());
  }

  function setThisMonth(): void {
    handleEntryModeChange("monthly");
    setEntryDate(getTodayDisplayDate());
  }

  function setToday(): void {
    handleEntryModeChange("daily");
    setEntryDate(getTodayDisplayDate());
  }

  function goToPreviousWeek(): void {
    if (entryMode === "monthly") {
      setEntryDate((current) => addMonthsToDisplayDate(current, -1));
      return;
    }

    if (entryMode === "daily") {
      setEntryDate((current) => addDaysToDisplayDate(current, -1));
      return;
    }

    setWeekStartDate((current) => addDaysToDisplayDate(current, -7));
  }

  function goToNextWeek(): void {
    if (entryMode === "monthly") {
      const nextEntryDate = addMonthsToDisplayDate(entryDate, 1);
      const nextEntryDateIso = parseDisplayDateToIso(nextEntryDate);

      if (nextEntryDateIso && nextEntryDateIso <= getTodayIsoDate()) {
        setEntryDate(nextEntryDate);
      }
      return;
    }

    if (entryMode === "daily") {
      const nextEntryDate = addDaysToDisplayDate(entryDate, 1);
      const nextEntryDateIso = parseDisplayDateToIso(nextEntryDate);

      if (nextEntryDateIso && nextEntryDateIso <= getTodayIsoDate()) {
        setEntryDate(nextEntryDate);
      }
      return;
    }

    const nextWeekStartDate = addDaysToDisplayDate(weekStartDate, 7);
    const nextWeekStartDateIso = parseDisplayDateToIso(nextWeekStartDate);
    const currentWeekStartDateIso = parseDisplayDateToIso(getCurrentMondayDisplayDate());

    if (nextWeekStartDateIso && currentWeekStartDateIso && nextWeekStartDateIso <= currentWeekStartDateIso) {
      setWeekStartDate(nextWeekStartDate);
    }
  }

  function handleEntryDateChange(value: string): void {
    const normalized = normalizeDateInput(value);
    const isoDate = parseDisplayDateToIso(normalized);
    if (isoDate && isoDate > getTodayIsoDate()) {
      setEntryDate(getTodayDisplayDate());
      setStatus({ kind: "info", text: "Future dates are not allowed. Using today instead." });
      return;
    }

    setEntryDate(normalized);
  }

  function handleWeekStartDateChange(value: string): void {
    const normalized = normalizeDateInput(value);
    const isoDate = parseDisplayDateToIso(normalized);
    if (isoDate && isoDate > getTodayIsoDate()) {
      setWeekStartDate(getCurrentMondayDisplayDate());
      setStatus({ kind: "info", text: "Future dates are not allowed. Using this week instead." });
      return;
    }

    setWeekStartDate(normalized);
  }

  function handlePublishEffectiveFromChange(value: string): void {
    const normalized = normalizeDateInput(value);
    const isoDate = parseDisplayDateToIso(normalized);
    if (isoDate && isoDate > getTodayIsoDate()) {
      setPublishEffectiveFrom(getTodayDisplayDate());
      return;
    }

    setPublishEffectiveFrom(normalized);
  }

  function handleSummaryAsOfDateChange(value: string): void {
    const normalized = normalizeDateInput(value);
    const isoDate = parseDisplayDateToIso(normalized);
    if (isoDate && isoDate > getTodayIsoDate()) {
      setSummaryAsOfDate(getTodayDisplayDate());
      setStatus({ kind: "info", text: "Year summary cannot go beyond today." });
      return;
    }

    setSummaryAsOfDate(normalized);
  }

  function fillQuickExpensePreset(): void {
    setFuel("25");
    setFuelReimbursed("0");
    setTravel("35");
    setTravelReimbursed("0");
    setFood("8");
    setFoodReimbursed("0");
    setOther("0");
    setOtherReimbursed("0");
  }

  function resetEntryDraft(): void {
    setServiceCompany("");
    setIncome("0");
    setFuel("0");
    setFuelReimbursed("0");
    setTravel("0");
    setTravelReimbursed("0");
    setFood("0");
    setFoodReimbursed("0");
    setOther("0");
    setOtherReimbursed("0");
  }

  function isDate(value: string): boolean {
    return parseDisplayDateToIso(value) !== null;
  }

  function isTaxYear(value: string): boolean {
    return /^\d{4}-\d{2}$/.test(value);
  }

  async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
    if (!authToken) {
      throw new Error("Not authenticated");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      ...(init?.headers as Record<string, string> | undefined)
    };

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers
    });

    if (response.status === 401) {
      await handleExpiredSession();
    }

    return response;
  }

  function switchAuthMode(nextMode: "login" | "register" | "reset" | "verify2fa"): void {
    setAuthMode(nextMode);
    setAuthPassword("");
    setAuthPasswordConfirm("");
    setResetCode("");
    setResetCodePreview(null);
    setTwoFactorCode("");
    if (nextMode !== "verify2fa") {
      setTwoFactorChallengeToken(null);
    }
  }

  async function saveAuthState(token: string, user: AuthUser): Promise<void> {
    sessionExpiryNoticeShown.current = false;
    setAuthToken(token);
    setAuthUser(user);
    await AsyncStorage.setItem(AUTH_STATE_KEY, JSON.stringify({ token, user }));
  }

  async function clearAuthState(
    message = "Signed out.",
    kind: "info" | "error" = "info",
    preserveEmail = false
  ): Promise<void> {
    const rememberedEmail = preserveEmail ? authUser?.email ?? authEmail : "";

    setAuthToken(null);
    setAuthUser(null);
    setAuthEmail(rememberedEmail);
    setAuthPassword("");
    setAuthPasswordConfirm("");
    setResetCode("");
    setResetCodePreview(null);
    setTwoFactorCode("");
    setTwoFactorChallengeToken(null);
    setTwoFactorEnabled(false);
    setTwoFactorSetupKey(null);
    setTwoFactorSetupUri(null);
    setCurrentWeekId(null);
    setReceipts([]);
    setSummary(null);
    setExportData("");
    setSetAside(null);
    setEstimatedTax(null);
    setModeLock(null);
    setAuthMode("login");
    await AsyncStorage.removeItem(AUTH_STATE_KEY);
    setStatus({ kind, text: message });

    if (message === "Signed out.") {
      sessionExpiryNoticeShown.current = false;
    }
  }

  async function handleExpiredSession(): Promise<void> {
    await clearAuthState("Your session expired. Please sign in again.", "error", true);

    if (!sessionExpiryNoticeShown.current) {
      sessionExpiryNoticeShown.current = true;
      Alert.alert("Session expired", "Your session expired. Please sign in again.");
    }
  }

  async function validateSession(): Promise<void> {
    try {
      await authedFetch("/auth/me");
    } catch {
      // Ignore connectivity issues during background session validation.
    }
  }

  async function fetchTwoFactorStatus(): Promise<void> {
    try {
      const response = await authedFetch("/auth/2fa/status");
      const payload = (await response.json()) as TwoFactorStatusResponse;
      if (response.ok) {
        setTwoFactorEnabled(Boolean(payload.enabled));
        if (!payload.pending_setup) {
          setTwoFactorSetupKey(null);
          setTwoFactorSetupUri(null);
        }
      }
    } catch {
      // Keep the existing session even if the status check fails.
    }
  }

  async function startTwoFactorSetup(): Promise<void> {
    setIsLoadingTwoFactor(true);
    try {
      const response = await authedFetch("/auth/2fa/setup", {
        method: "POST",
        body: JSON.stringify({})
      });
      const payload = await response.json();

      if (!response.ok) {
        Alert.alert("2-Step Verification", payload.error || "Could not start setup.");
        return;
      }

      setTwoFactorSetupKey(payload.manual_entry_key ?? null);
      setTwoFactorSetupUri(payload.otpauth_url ?? null);
      setTwoFactorCode("");
      setStatus({ kind: "info", text: "Add the setup key to your authenticator app, then enter the 6-digit code." });
      Alert.alert(
        "Authenticator Setup Key",
        `Add this key to Google Authenticator, Microsoft Authenticator, or Authy:\n\n${payload.manual_entry_key}`
      );
    } catch (error) {
      Alert.alert("Network error", String(error));
    } finally {
      setIsLoadingTwoFactor(false);
    }
  }

  async function enableTwoFactor(): Promise<void> {
    if (!twoFactorCode.trim()) {
      Alert.alert("Validation", "Enter the 6-digit authenticator code.");
      return;
    }

    setIsLoadingTwoFactor(true);
    try {
      const response = await authedFetch("/auth/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ code: twoFactorCode.trim() })
      });
      const payload = await response.json();

      if (!response.ok) {
        Alert.alert("2-Step Verification", payload.error || "Could not enable 2-step verification.");
        return;
      }

      setTwoFactorEnabled(true);
      setTwoFactorSetupKey(null);
      setTwoFactorSetupUri(null);
      setTwoFactorCode("");
      setStatus({ kind: "info", text: payload.message || "Two-step verification enabled." });
    } catch (error) {
      Alert.alert("Network error", String(error));
    } finally {
      setIsLoadingTwoFactor(false);
    }
  }

  async function disableTwoFactor(): Promise<void> {
    if (!twoFactorCode.trim()) {
      Alert.alert("Validation", "Enter your current authenticator code to disable 2-step verification.");
      return;
    }

    setIsLoadingTwoFactor(true);
    try {
      const response = await authedFetch("/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ code: twoFactorCode.trim() })
      });
      const payload = await response.json();

      if (!response.ok) {
        Alert.alert("2-Step Verification", payload.error || "Could not disable 2-step verification.");
        return;
      }

      setTwoFactorEnabled(false);
      setTwoFactorSetupKey(null);
      setTwoFactorSetupUri(null);
      setTwoFactorCode("");
      setStatus({ kind: "info", text: payload.message || "Two-step verification disabled." });
    } catch (error) {
      Alert.alert("Network error", String(error));
    } finally {
      setIsLoadingTwoFactor(false);
    }
  }

  async function verifyTwoFactorSignIn(): Promise<void> {
    if (!twoFactorChallengeToken || !twoFactorCode.trim()) {
      Alert.alert("Validation", "Enter the 6-digit authenticator code.");
      return;
    }

    setIsAuthLoading(true);
    setStatus({ kind: "info", text: "Verifying sign-in code..." });

    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_token: twoFactorChallengeToken,
          code: twoFactorCode.trim()
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        Alert.alert("Verification error", payload.error || "Two-step verification failed.");
        setStatus({ kind: "error", text: payload.error || "Two-step verification failed." });
        return;
      }

      setTwoFactorCode("");
      setTwoFactorChallengeToken(null);
      await saveAuthState(payload.token, payload.user as AuthUser);
      setAuthMode("login");
      setStatus({ kind: "info", text: `Signed in as ${payload.user.email}.` });
    } catch (error) {
      Alert.alert("Network error", String(error));
      setStatus({ kind: "error", text: "Network error during sign-in verification." });
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function loadReceipts(weeklyEntryId: string): Promise<void> {
    setIsLoadingReceipts(true);
    try {
      const response = await authedFetch(`/receipts/${weeklyEntryId}`);
      const payload = await response.json();
      if (!response.ok) {
        setStatus({ kind: "error", text: payload.error || "Failed to load receipts." });
        return;
      }

      setReceipts((payload.receipts || []) as ReceiptRecord[]);
    } catch {
      setStatus({ kind: "error", text: "Network error while loading receipts." });
    } finally {
      setIsLoadingReceipts(false);
    }
  }

  async function pickAndUploadReceipt(): Promise<void> {
    if (!currentWeekId) {
      Alert.alert("Upload", "Save a weekly entry first before uploading a receipt.");
      return;
    }

    setIsUploadingReceipt(true);

    try {
      const selected = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ["image/*", "application/pdf"]
      });

      if (selected.canceled || selected.assets.length === 0) {
        return;
      }

      const asset = selected.assets[0];
      const body = new FormData();
      body.append("weekly_entry_id", currentWeekId);
      body.append("receipt", {
        uri: asset.uri,
        name: asset.name ?? "receipt",
        type: asset.mimeType ?? "application/octet-stream"
      } as never);

      const response = await fetch(`${API_BASE_URL}/receipts/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken ?? ""}`
        },
        body
      });

      const payload = await response.json();
      if (!response.ok) {
        Alert.alert("Upload error", payload.error || "Receipt upload failed");
        setStatus({ kind: "error", text: payload.error || "Receipt upload failed." });
        return;
      }

      setStatus({ kind: "info", text: "Receipt uploaded." });
      await loadReceipts(currentWeekId);
    } catch (error) {
      Alert.alert("Upload error", String(error));
      setStatus({ kind: "error", text: "Network error while uploading receipt." });
    } finally {
      setIsUploadingReceipt(false);
    }
  }

  function safeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  async function openReceipt(receipt: ReceiptRecord): Promise<void> {
    if (!receipt.download_url) {
      Alert.alert("Unavailable", "This receipt does not have a download link yet. Refresh receipts.");
      return;
    }

    if (!authToken) {
      Alert.alert("Not signed in", "Please sign in again.");
      return;
    }

    const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!cacheDir) {
      Alert.alert("File error", "No writable directory is available on this device.");
      return;
    }

    const localUri = `${cacheDir}${Date.now()}-${receipt.id}-${safeFileName(receipt.original_filename)}`;
    setOpeningReceiptId(receipt.id);

    try {
      const task = FileSystem.createDownloadResumable(receipt.download_url, localUri, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const result = await task.downloadAsync();
      if (!result?.uri) {
        Alert.alert("Download failed", "Could not save the receipt file.");
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          dialogTitle: "Open or share receipt"
        });
      } else {
        Alert.alert("Downloaded", `Receipt saved at ${result.uri}`);
      }
    } catch (error) {
      Alert.alert("Download error", String(error));
    } finally {
      setOpeningReceiptId(null);
    }
  }

  async function requestPasswordReset(): Promise<void> {
    if (!authEmail.trim()) {
      Alert.alert("Validation", "Enter your email first.");
      return;
    }

    setIsRequestingReset(true);
    setStatus({ kind: "info", text: "Requesting reset code..." });

    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.trim() })
      });
      const payload = await response.json();

      if (!response.ok) {
        Alert.alert("Reset error", payload.error || "Could not start password reset.");
        setStatus({ kind: "error", text: payload.error || "Could not start password reset." });
        return;
      }

      if (payload.reset_code_preview) {
        setResetCode(payload.reset_code_preview);
        setResetCodePreview(payload.reset_code_preview);
        Alert.alert("Reset code", `Use this code: ${payload.reset_code_preview}`);
      }

      setStatus({ kind: "info", text: payload.message || "Reset code generated." });
    } catch (error) {
      Alert.alert("Network error", String(error));
      setStatus({ kind: "error", text: "Network error while requesting reset code." });
    } finally {
      setIsRequestingReset(false);
    }
  }

  async function submitPasswordReset(): Promise<void> {
    if (!authEmail.trim() || !resetCode.trim() || !authPassword.trim()) {
      Alert.alert("Validation", "Email, reset code, and new password are required.");
      return;
    }

    if (authPassword.length < 8) {
      Alert.alert("Validation", "New password must be at least 8 characters.");
      return;
    }

    if (authPassword !== authPasswordConfirm) {
      Alert.alert("Validation", "Password confirmation does not match.");
      return;
    }

    setIsAuthLoading(true);
    setStatus({ kind: "info", text: "Updating password..." });

    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authEmail.trim(),
          code: resetCode.trim(),
          new_password: authPassword
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        Alert.alert("Reset error", payload.error || "Password reset failed.");
        setStatus({ kind: "error", text: payload.error || "Password reset failed." });
        return;
      }

      setResetCode("");
      setResetCodePreview(null);
      await saveAuthState(payload.token, payload.user as AuthUser);
      setStatus({ kind: "info", text: "Password updated and you are now signed in." });
    } catch (error) {
      Alert.alert("Network error", String(error));
      setStatus({ kind: "error", text: "Network error during password reset." });
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function submitAuth(): Promise<void> {
    if (authMode === "reset") {
      await submitPasswordReset();
      return;
    }

    if (authMode === "verify2fa") {
      await verifyTwoFactorSignIn();
      return;
    }

    if (!authEmail.trim() || !authPassword.trim()) {
      Alert.alert("Validation", "Email and password are required.");
      return;
    }

    if (authPassword.length < 8) {
      Alert.alert("Validation", "Password must be at least 8 characters.");
      return;
    }

    if (authMode === "register" && authPassword !== authPasswordConfirm) {
      Alert.alert("Validation", "Password confirmation does not match.");
      return;
    }

    setIsAuthLoading(true);
    setStatus({ kind: "info", text: authMode === "register" ? "Creating account..." : "Signing in..." });

    try {
      const route = authMode === "register" ? "register" : "login";
      const response = await fetch(`${API_BASE_URL}/auth/${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword })
      });
      const payload = await response.json();

      if (!response.ok) {
        Alert.alert("Auth error", payload.error || "Authentication failed");
        setStatus({ kind: "error", text: payload.error || "Authentication failed." });
        return;
      }

      if (payload.two_factor_required && payload.challenge_token) {
        setTwoFactorChallengeToken(payload.challenge_token as string);
        setAuthMode("verify2fa");
        setTwoFactorCode("");
        setStatus({ kind: "info", text: payload.message || "Enter your authenticator code to finish signing in." });
        return;
      }

      await saveAuthState(payload.token, payload.user as AuthUser);
      setStatus({ kind: "info", text: `Signed in as ${payload.user.email}.` });
    } catch (error) {
      Alert.alert("Network error", String(error));
      setStatus({ kind: "error", text: "Network error during authentication." });
    } finally {
      setIsAuthLoading(false);
    }
  }

  function confirmWeeklyEntrySubmission(): void {
    Alert.alert(
      entryMode === "monthly"
        ? "Confirm monthly submission"
        : entryMode === "daily"
          ? "Confirm daily submission"
          : "Confirm weekly submission",
      "Please check your figures carefully. After submission, this record is locked and changes cannot be made.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: entryMode === "monthly" ? "Submit month" : entryMode === "daily" ? "Submit day" : "Submit week",
          style: "destructive",
          onPress: () => {
            void submitWeeklyEntry();
          }
        }
      ]
    );
  }

  async function submitWeeklyEntry(): Promise<void> {
    if (!authUser) {
      setStatus({ kind: "error", text: "Please sign in first." });
      return;
    }

    const effectiveDate = entryMode === "weekly" ? weekStartDate : entryDate;
    const effectiveWeekStartDate =
      entryMode === "monthly"
        ? getMonthStartFromDate(entryDate)
        : entryMode === "daily"
          ? getWeekStartFromDate(entryDate)
          : weekStartDate;
    const effectiveDateIso = parseDisplayDateToIso(effectiveDate);
    const effectiveWeekStartDateIso = parseDisplayDateToIso(effectiveWeekStartDate);

    if (!effectiveDateIso || !effectiveWeekStartDateIso) {
      Alert.alert(
        "Validation",
        entryMode === "monthly"
          ? "Month date must be in DD-MM-YYYY format."
          : entryMode === "daily"
            ? "Daily date must be in DD-MM-YYYY format."
            : "Week start date must be in DD-MM-YYYY format."
      );
      setStatus({ kind: "error", text: "Date format is invalid." });
      return;
    }

    if (effectiveDateIso > getTodayIsoDate() || effectiveWeekStartDateIso > getTodayIsoDate()) {
      Alert.alert("Validation", "Future dates are not allowed.");
      setStatus({ kind: "error", text: "Entry date cannot be beyond today." });
      return;
    }

    if (Number(income || 0) < 0) {
      Alert.alert("Validation", "Income cannot be negative.");
      setStatus({ kind: "error", text: "Income must be zero or more." });
      return;
    }

    setIsSavingWeek(true);
    setStatus({
      kind: "info",
      text: entryMode === "monthly" ? "Saving monthly entry..." : entryMode === "daily" ? "Saving daily entry..." : "Saving weekly entry..."
    });

    try {
      const response = await authedFetch("/weekly-entry", {
        method: "POST",
        body: JSON.stringify({
          week_start_date: effectiveWeekStartDateIso,
          entry_date: effectiveDateIso,
          entry_mode: entryMode,
          income_total: Number(income || 0),
          company_providing_services_for: serviceCompany.trim() || null,
          expenses
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        const lockedMode = normalizeEntryMode(payload.locked_mode);
        if (lockedMode) {
          setModeLock({
            locked: true,
            locked_mode: lockedMode,
            week_start_date: payload.week_start_date || effectiveWeekStartDateIso
          });
          setEntryMode(lockedMode);
        }

        Alert.alert("Error", payload.error || "Failed to submit entry");
        setStatus({ kind: "error", text: payload.error || "Failed to submit entry." });
        return;
      }

      setSetAside(payload.estimate.total_to_set_aside ?? 0);
      setEstimatedTax((payload.estimate.estimated_income_tax ?? 0) + (payload.estimate.estimated_ni ?? 0));
      setModeLock({
        locked: true,
        locked_mode: entryMode,
        week_start_date: effectiveWeekStartDateIso,
        existing_entry_dates: entryMode === "weekly" ? [effectiveWeekStartDateIso] : [effectiveDateIso]
      });
      setCurrentWeekId(payload.weekly_entry_id ?? null);
      if (payload.weekly_entry_id) {
        await loadReceipts(payload.weekly_entry_id);
      }
      setLastSavedAt(formatAuditTimestamp(payload.submitted_at || new Date().toISOString()));
      setStatus({
        kind: "info",
        text:
          entryMode === "monthly"
            ? `Monthly entry saved into month starting ${effectiveWeekStartDate}.`
            : entryMode === "daily"
              ? `Daily entry saved into week starting ${effectiveWeekStartDate}.`
              : "Weekly entry saved and locked with timestamp."
      });
      Alert.alert(
        "Saved",
        entryMode === "monthly"
          ? `Monthly entry recorded for ${effectiveDate}.`
          : entryMode === "daily"
            ? `Daily entry recorded for ${effectiveDate}.`
            : "Weekly entry locked and recorded."
      );
    } catch (error) {
      Alert.alert("Network error", String(error));
      setStatus({ kind: "error", text: "Network error while saving entry." });
    } finally {
      setIsSavingWeek(false);
    }
  }

  async function clearWeekData(weekStartDateDisplay: string): Promise<void> {
    const weekStartDateIso = parseDisplayDateToIso(weekStartDateDisplay);
    if (!weekStartDateIso) {
      throw new Error("Invalid date format");
    }

    const response = await authedFetch(`/weekly-entry/${weekStartDateIso}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const raw = await response.text();
      let message = "Failed to clear week data";
      if (raw) {
        try {
          const payload = JSON.parse(raw) as { error?: string };
          if (payload?.error) {
            message = payload.error;
          }
        } catch {
          message = raw;
        }
      }
      throw new Error(message);
    }

    setModeLock(null);
    setSetAside(null);
    setEstimatedTax(null);
    setCurrentWeekId(null);
    setReceipts([]);
    setSummary(null);
    setExportData("");
    setLastSavedAt(null);
    resetEntryDraft();
    setStatus({ kind: "info", text: entryMode === "monthly" ? "This month's data has been cleared." : "This week's data has been cleared." });
  }

  async function clearAllData(): Promise<void> {
    const response = await authedFetch("/all-entries", {
      method: "DELETE"
    });

    if (!response.ok) {
      const raw = await response.text();
      let message = "Failed to clear all data";
      if (raw) {
        try {
          const payload = JSON.parse(raw) as { error?: string };
          if (payload?.error) {
            message = payload.error;
          }
        } catch {
          message = raw;
        }
      }
      throw new Error(message);
    }

    setModeLock(null);
    setSetAside(null);
    setEstimatedTax(null);
    setCurrentWeekId(null);
    setReceipts([]);
    setSummary(null);
    setExportData("");
    setLastSavedAt(null);
    resetEntryDraft();
    setStatus({ kind: "info", text: "All data has been cleared." });
  }

  async function fetchSummary(): Promise<void> {
    if (!authUser) {
      setStatus({ kind: "error", text: "Please sign in first." });
      return;
    }

    if (!isTaxYear(taxYear)) {
      Alert.alert("Validation", "Tax year must be in YYYY-YY format, for example 2026-27.");
      setStatus({ kind: "error", text: "Tax year format is invalid." });
      return;
    }

    const asOfDateIso = parseDisplayDateToIso(summaryAsOfDate);
    if (!asOfDateIso) {
      Alert.alert("Validation", "Summary snapshot date must be in DD-MM-YYYY format.");
      setStatus({ kind: "error", text: "Summary snapshot date is invalid." });
      return;
    }

    if (asOfDateIso > getTodayIsoDate()) {
      Alert.alert("Validation", "Summary snapshot date cannot be in the future.");
      setStatus({ kind: "error", text: "Summary snapshot date cannot be beyond today." });
      return;
    }

    setIsLoadingSummary(true);
    setStatus({ kind: "info", text: `Loading year snapshot up to ${summaryAsOfDate}...` });

    try {
      const response = await authedFetch(`/summary/${taxYear}?as_of=${encodeURIComponent(asOfDateIso)}`);
      const payload = await response.json();
      if (!response.ok) {
        Alert.alert("Error", payload.error || "Failed to fetch summary");
        setStatus({ kind: "error", text: payload.error || "Failed to load summary." });
        return;
      }

      setSummary({
        as_of_date: payload.as_of_date || asOfDateIso,
        weeks_logged: Number(payload.weeks_logged ?? 0),
        total_income: Number(payload.total_income ?? 0),
        total_expenses: Number(payload.total_expenses ?? 0),
        net_profit: Number(payload.net_profit ?? 0),
        estimated_income_tax: Number(payload.estimated_income_tax ?? 0),
        estimated_ni: Number(payload.estimated_ni ?? 0),
        weekly_breakdown: Array.isArray(payload.weekly_breakdown)
          ? payload.weekly_breakdown.map((week: Record<string, unknown>) => ({
              period_start: String(week.period_start ?? ""),
              period_label: String(week.period_label ?? week.period_start ?? ""),
              entries_logged: Number(week.entries_logged ?? 0),
              total_income: Number(week.total_income ?? 0),
              total_expenses: Number(week.total_expenses ?? 0),
              net_profit: Number(week.net_profit ?? 0)
            }))
          : [],
        monthly_breakdown: Array.isArray(payload.monthly_breakdown)
          ? payload.monthly_breakdown.map((month: Record<string, unknown>) => ({
              month: String(month.month ?? ""),
              month_label: String(month.month_label ?? month.month ?? ""),
              entries_logged: Number(month.entries_logged ?? 0),
              total_income: Number(month.total_income ?? 0),
              total_expenses: Number(month.total_expenses ?? 0),
              net_profit: Number(month.net_profit ?? 0)
            }))
          : [],
        updated_at: payload.updated_at ?? null
      });
      setStatus({ kind: "info", text: `Year snapshot loaded up to ${summaryAsOfDate}.` });
    } catch (error) {
      Alert.alert("Network error", String(error));
      setStatus({ kind: "error", text: "Network error while loading summary." });
    } finally {
      setIsLoadingSummary(false);
    }
  }

  async function fetchAuditTrail(): Promise<void> {
    if (!authUser) {
      setStatus({ kind: "error", text: "Please sign in first." });
      return;
    }

    if (!isTaxYear(taxYear)) {
      Alert.alert("Validation", "Tax year must be in YYYY-YY format, for example 2026-27.");
      setStatus({ kind: "error", text: "Tax year format is invalid." });
      return;
    }

    setIsLoadingAudit(true);
    setStatus({ kind: "info", text: "Loading audit trail..." });

    try {
      const response = await authedFetch(`/audit/${taxYear}`);
      const payload = await response.json();
      if (!response.ok) {
        Alert.alert("Error", payload.error || "Failed to load audit trail");
        setStatus({ kind: "error", text: payload.error || "Failed to load audit trail." });
        return;
      }

      const entries = Array.isArray(payload.entries)
        ? payload.entries.map((entry: Record<string, unknown>) => ({
            id: String(entry.id ?? ""),
            week_start_date: String(entry.week_start_date ?? ""),
            entry_date: entry.entry_date ? String(entry.entry_date) : null,
            entry_mode: String(entry.entry_mode ?? "weekly"),
            income_total: Number(entry.income_total ?? 0),
            total_expenses: Number(entry.total_expenses ?? 0),
            net_profit: Number(entry.net_profit ?? 0),
            company_providing_services_for: entry.company_providing_services_for
              ? String(entry.company_providing_services_for)
              : null,
            created_at: String(entry.created_at ?? ""),
            receipts: Array.isArray(entry.receipts)
              ? entry.receipts.map((receipt: Record<string, unknown>) => ({
                  id: String(receipt.id ?? ""),
                  weekly_entry_id: String(receipt.weekly_entry_id ?? entry.id ?? ""),
                  original_filename: String(receipt.original_filename ?? "receipt"),
                  storage_path: String(receipt.storage_path ?? ""),
                  mime_type: receipt.mime_type ? String(receipt.mime_type) : null,
                  file_size_bytes: Number(receipt.file_size_bytes ?? 0),
                  created_at: String(receipt.created_at ?? ""),
                  download_url: String(receipt.download_url ?? "")
                }))
              : []
          }))
        : [];

      setAuditEntries(entries);
      setStatus({ kind: "info", text: `Audit trail loaded (${entries.length} entries).` });
    } catch (error) {
      Alert.alert("Network error", String(error));
      setStatus({ kind: "error", text: "Network error while loading audit trail." });
    } finally {
      setIsLoadingAudit(false);
    }
  }

  async function saveCsvExport(
    csvText: string,
    year: string,
    action: "download" | "share",
    contentDisposition?: string | null
  ): Promise<string> {
    const fileNameMatch = /filename\s*=\s*"?([^";]+)"?/i.exec(contentDisposition ?? "");
    const fileName = fileNameMatch?.[1] || `self-assessment-${year}.csv`;

    const webDocument = (globalThis as {
      document?: { body?: { appendChild: (node: unknown) => void } } & Record<string, any>;
      navigator?: { share?: (data: { title?: string; text?: string }) => Promise<void> };
    }).document;
    const webNavigator = (globalThis as {
      navigator?: { share?: (data: { title?: string; text?: string }) => Promise<void> };
    }).navigator;

    if (Platform.OS === "web" && webDocument) {
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8", lastModified: Date.now() });
      const url = URL.createObjectURL(blob);

      if (action === "share" && webNavigator?.share) {
        await webNavigator.share({
          title: `Qbit self assessment export ${year}`,
          text: "Your CSV export has been prepared and downloaded for sharing by email."
        });
      }

      const link = webDocument.createElement("a");
      link.href = url;
      link.download = fileName;
      webDocument.body?.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return fileName;
    }

    const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!baseDir) {
      return fileName;
    }

    const fileUri = `${baseDir}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, csvText, {
      encoding: FileSystem.EncodingType.UTF8
    });

    if (action === "share" && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "text/csv",
        dialogTitle: "Email or share export"
      });
    }

    return fileName;
  }

  async function fetchExport(action: "download" | "share" = "download"): Promise<void> {
    if (!authUser) {
      setStatus({ kind: "error", text: "Please sign in first." });
      return;
    }

    if (!isTaxYear(taxYear)) {
      Alert.alert("Validation", "Tax year must be in YYYY-YY format, for example 2026-27.");
      setStatus({ kind: "error", text: "Tax year format is invalid." });
      return;
    }

    setIsLoadingExport(true);
    setStatus({ kind: "info", text: action === "share" ? "Preparing email/share export..." : "Preparing download..." });

    try {
      const response = await authedFetch(`/export/${taxYear}?format=csv`);
      const payload = await response.text();
      if (!response.ok) {
        let errorMessage = "Failed to export.";
        try {
          const errorPayload = JSON.parse(payload) as { error?: string };
          errorMessage = errorPayload.error || errorMessage;
        } catch {
          errorMessage = payload || errorMessage;
        }

        Alert.alert("Error", errorMessage);
        setStatus({ kind: "error", text: errorMessage });
        return;
      }

      setExportData(payload);
      const fileName = await saveCsvExport(payload, taxYear, action, response.headers.get("content-disposition"));
      setStatus({
        kind: "info",
        text: action === "share" ? `CSV ready to email/share as ${fileName}.` : `CSV downloaded as ${fileName}.`
      });
    } catch (error) {
      Alert.alert("Network error", String(error));
      setStatus({ kind: "error", text: "Network error while exporting." });
    } finally {
      setIsLoadingExport(false);
    }
  }

  async function fetchMonitoring(): Promise<void> {
    if (!authUser) {
      setStatus({ kind: "error", text: "Please sign in first." });
      return;
    }

    if (!isTaxYear(taxYear)) {
      Alert.alert("Validation", "Tax year must be in YYYY-YY format.");
      return;
    }

    setIsLoadingMonitoring(true);
    try {
      const headers: Record<string, string> = {};
      if (rulePublishSecretInput.trim()) {
        headers["x-rule-publish-secret"] = rulePublishSecretInput.trim();
      }
      const response = await authedFetch(`/rules/${taxYear}/monitoring`, { headers });
      const payload = await response.json();
      if (!response.ok) {
        Alert.alert("Error", payload.error || "Failed to load monitoring.");
        return;
      }

      setMonitoringData(payload as RuleMonitoringResponse);
      setStatus({ kind: "info", text: "Rule monitoring loaded." });
    } catch (error) {
      Alert.alert("Network error", String(error));
    } finally {
      setIsLoadingMonitoring(false);
    }
  }

  async function fetchAuditEvents(): Promise<void> {
    if (!authUser) {
      setStatus({ kind: "error", text: "Please sign in first." });
      return;
    }

    if (!isTaxYear(taxYear)) {
      Alert.alert("Validation", "Tax year must be in YYYY-YY format.");
      return;
    }

    setIsLoadingAuditEvents(true);
    try {
      const headers: Record<string, string> = {};
      if (rulePublishSecretInput.trim()) {
        headers["x-rule-publish-secret"] = rulePublishSecretInput.trim();
      }
      const response = await authedFetch(`/admin/rules/${taxYear}/audit-events?limit=30`, { headers });
      const payload = await response.json();
      if (!response.ok) {
        Alert.alert("Error", payload.error || "Failed to load audit events.");
        return;
      }

      setAuditEvents((payload.events || []) as RuleAuditEvent[]);
      setStatus({ kind: "info", text: "Audit events loaded." });
    } catch (error) {
      Alert.alert("Network error", String(error));
    } finally {
      setIsLoadingAuditEvents(false);
    }
  }

  async function publishRuleVersion(): Promise<void> {
    if (!authUser) {
      setStatus({ kind: "error", text: "Please sign in first." });
      return;
    }

    if (!isTaxYear(taxYear)) {
      Alert.alert("Validation", "Tax year must be in YYYY-YY format.");
      return;
    }

    if (!isDate(publishEffectiveFrom)) {
      Alert.alert("Validation", "Effective from must be in DD-MM-YYYY format.");
      return;
    }

    const publishEffectiveFromIso = parseDisplayDateToIso(publishEffectiveFrom);
    if (!publishEffectiveFromIso) {
      Alert.alert("Validation", "Effective from date is invalid.");
      return;
    }

    setIsPublishingRule(true);
    try {
      const headers: Record<string, string> = {};
      if (rulePublishSecretInput.trim()) {
        headers["x-rule-publish-secret"] = rulePublishSecretInput.trim();
      }
      const response = await authedFetch(`/rules/${taxYear}/publish`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          effective_from: publishEffectiveFromIso,
          effective_to: null,
          source_reference: publishSourceReference.trim() || null,
          notes: publishNotes.trim() || null,
          personal_allowance: Number(publishPersonalAllowance || 0),
          basic_rate_limit: Number(publishBasicRateLimit || 0),
          basic_rate: Number(publishBasicRate || 0),
          higher_rate: Number(publishHigherRate || 0),
          ni_class2_weekly: Number(publishNiClass2Weekly || 0),
          ni_class4_threshold: Number(publishNiClass4Threshold || 0),
          ni_class4_rate: Number(publishNiClass4Rate || 0)
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        Alert.alert("Publish failed", payload.error || "Could not publish rule version.");
        return;
      }

      setMonitoringData((payload.monitoring || null) as RuleMonitoringResponse | null);
      setStatus({
        kind: "info",
        text: `Rule version ${payload.published_rule_set?.version ?? "?"} published for ${taxYear}.`
      });
      await fetchAuditEvents();
    } catch (error) {
      Alert.alert("Network error", String(error));
    } finally {
      setIsPublishingRule(false);
    }
  }

  async function updateUserRole(): Promise<void> {
    if (!authUser) {
      setStatus({ kind: "error", text: "Please sign in first." });
      return;
    }

    if (!adminTargetEmail.trim()) {
      Alert.alert("Validation", "Target email is required.");
      return;
    }

    setIsUpdatingUserRole(true);
    try {
      const headers: Record<string, string> = {};
      if (rulePublishSecretInput.trim()) {
        headers["x-rule-publish-secret"] = rulePublishSecretInput.trim();
      }

      const response = await authedFetch("/admin/users/role", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: adminTargetEmail.trim(),
          role: adminTargetRole
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        Alert.alert("Role update failed", payload.error || "Could not update user role.");
        return;
      }

      setStatus({ kind: "info", text: `Updated ${payload.user?.email} to role ${payload.user?.role}.` });
    } catch (error) {
      Alert.alert("Network error", String(error));
    } finally {
      setIsUpdatingUserRole(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundOrnamentOne} />
      <View style={styles.backgroundOrnamentTwo} />

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {!authToken || !authUser ? (
          <Animated.ScrollView
            style={{ opacity: contentOpacity }}
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
            <Card>
              <Text style={styles.authTitle}>Account Access</Text>
              <Text style={styles.noteText}>
                {authMode === "reset"
                  ? "Request a reset code and choose a new password."
                  : authMode === "verify2fa"
                    ? "Open your authenticator app and enter the 6-digit code to finish signing in."
                    : "Create your account or sign in to access weekly tax records."}
              </Text>

              <Field label="Email" value={authEmail} onChange={setAuthEmail} placeholder="you@example.com" />

              {authMode === "reset" ? (
                <>
                  <Pressable
                    onPress={requestPasswordReset}
                    style={[styles.primaryButton, isRequestingReset && styles.buttonDisabled]}
                    disabled={isRequestingReset}
                  >
                    {isRequestingReset ? (
                      <ActivityIndicator color={colors.accentText} />
                    ) : (
                      <Text style={styles.primaryButtonText}>Send Reset Code</Text>
                    )}
                  </Pressable>

                  {!!resetCodePreview && (
                    <Text style={styles.noteText}>Reset code ready. Use the alert code to continue.</Text>
                  )}

                  <Field
                    label="Reset Code"
                    value={resetCode}
                    onChange={setResetCode}
                    placeholder="6-digit code"
                  />
                  <Field
                    label="New Password"
                    value={authPassword}
                    onChange={setAuthPassword}
                    placeholder="At least 8 characters"
                  />
                  <Field
                    label="Confirm New Password"
                    value={authPasswordConfirm}
                    onChange={setAuthPasswordConfirm}
                    placeholder="Repeat your new password"
                  />
                </>
              ) : authMode === "verify2fa" ? (
                <Field
                  label="Authenticator Code"
                  value={twoFactorCode}
                  onChange={setTwoFactorCode}
                  placeholder="6-digit code"
                />
              ) : (
                <>
                  <Field
                    label="Password"
                    value={authPassword}
                    onChange={setAuthPassword}
                    placeholder="At least 8 characters"
                  />
                  {authMode === "register" && (
                    <Field
                      label="Confirm Password"
                      value={authPasswordConfirm}
                      onChange={setAuthPasswordConfirm}
                      placeholder="Repeat your password"
                    />
                  )}
                </>
              )}

              <Pressable
                onPress={submitAuth}
                style={[styles.primaryButton, isAuthLoading && styles.buttonDisabled]}
                disabled={isAuthLoading}
              >
                {isAuthLoading ? (
                  <ActivityIndicator color={colors.accentText} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {authMode === "register"
                      ? "Create Account"
                      : authMode === "reset"
                        ? "Update Password"
                        : authMode === "verify2fa"
                          ? "Verify Sign-In"
                          : "Sign In"}
                  </Text>
                )}
              </Pressable>

              {authMode === "login" && (
                <Pressable onPress={() => switchAuthMode("reset")} style={styles.switchModeButton}>
                  <Text style={styles.switchModeText}>Forgot password?</Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => switchAuthMode(authMode === "register" ? "login" : "register")}
                style={styles.switchModeButton}
              >
                <Text style={styles.switchModeText}>
                  {authMode === "register"
                    ? "Already have an account? Sign in"
                    : authMode === "reset" || authMode === "verify2fa"
                      ? "Back to sign in"
                      : "Need an account? Register"}
                </Text>
              </Pressable>
            </Card>

            {status && (
              <Animated.View style={{ transform: [{ scale: statusPulse }] }}>
                <StatusBanner kind={status.kind} text={status.text} />
              </Animated.View>
            )}
          </Animated.ScrollView>
        ) : (
          <>
            <AppHeader screen={screen} onChange={setScreen} isAdmin={isAdmin} />

            <Animated.ScrollView
              style={{ opacity: contentOpacity }}
              contentContainerStyle={styles.container}
              keyboardShouldPersistTaps="handled"
            >
              <Card>
                <Text style={styles.label}>Signed in as</Text>
                <Text style={styles.signedInEmail}>{authUser.email}</Text>
                <Text style={styles.noteText}>Role: {authUser.role ?? "user"}</Text>
                <Pressable
                  onPress={() => {
                    void clearAuthState();
                  }}
                  style={styles.smallSignOutButton}
                >
                  <Text style={styles.smallSignOutText}>Sign out</Text>
                </Pressable>
              </Card>

              {screen === "week" && (
                <SnapshotCard
                  setAside={roundedSetAside}
                  estimatedTax={roundedTax}
                  claimable={`£${expensePreview.totalClaimable.toFixed(2)}`}
                  profit={`£${expensePreview.profit.toFixed(2)}`}
                  lastSavedAt={lastSavedAt}
                />
              )}

              {status && (
                <Animated.View style={{ transform: [{ scale: statusPulse }] }}>
                  <StatusBanner kind={status.kind} text={status.text} />
                </Animated.View>
              )}

              {screen === "week" && (
                <FormSection
                  title={
                    entryMode === "monthly" ? "Monthly Entry" : entryMode === "daily" ? "Daily Entry" : "This Week"
                  }
                >
                  <View style={styles.periodSegment}>
                    <Pressable
                      onPress={() => handleEntryModeChange("weekly")}
                      disabled={modeLock?.locked_mode === "monthly" || modeLock?.locked_mode === "daily"}
                      style={[
                        styles.periodSegmentOption,
                        entryMode === "weekly" && styles.periodSegmentOptionActive,
                        (modeLock?.locked_mode === "monthly" || modeLock?.locked_mode === "daily") &&
                          styles.periodSegmentOptionDisabled
                      ]}
                    >
                      <Text
                        style={[
                          styles.periodSegmentText,
                          entryMode === "weekly" && styles.periodSegmentTextActive
                        ]}
                      >
                        Weekly
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleEntryModeChange("monthly")}
                      disabled={modeLock?.locked_mode === "weekly" || modeLock?.locked_mode === "daily"}
                      style={[
                        styles.periodSegmentOption,
                        entryMode === "monthly" && styles.periodSegmentOptionActive,
                        (modeLock?.locked_mode === "weekly" || modeLock?.locked_mode === "daily") &&
                          styles.periodSegmentOptionDisabled
                      ]}
                    >
                      <Text
                        style={[
                          styles.periodSegmentText,
                          entryMode === "monthly" && styles.periodSegmentTextActive
                        ]}
                      >
                        Monthly
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleEntryModeChange("daily")}
                      disabled={modeLock?.locked_mode === "weekly" || modeLock?.locked_mode === "monthly"}
                      style={[
                        styles.periodSegmentOption,
                        entryMode === "daily" && styles.periodSegmentOptionActive,
                        (modeLock?.locked_mode === "weekly" || modeLock?.locked_mode === "monthly") &&
                          styles.periodSegmentOptionDisabled
                      ]}
                    >
                      <Text
                        style={[
                          styles.periodSegmentText,
                          entryMode === "daily" && styles.periodSegmentTextActive
                        ]}
                      >
                        Daily
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.noteText}>
                    {entryMode === "monthly"
                      ? `Monthly entries roll into the month starting ${resolvedWeekStart}.`
                      : entryMode === "daily"
                        ? `Daily entries roll into the week starting ${resolvedWeekStart}.`
                        : "Weekly mode records the full week in one submission."}
                  </Text>
                  {modeLock?.locked && modeLock.locked_mode && (
                    <Text style={[styles.noteText, { color: colors.accent, fontWeight: "700" }]}>
                      This period is locked to {modeLock.locked_mode} mode until the next period.
                    </Text>
                  )}
                  <View style={styles.quickActionsRow}>
                    <SmallAction
                      label={entryMode === "monthly" ? "Previous Month" : entryMode === "daily" ? "Previous Day" : "Previous Week"}
                      onPress={goToPreviousWeek}
                    />
                    <SmallAction
                      label={entryMode === "monthly" ? "Next Month" : entryMode === "daily" ? "Next Day" : "Next Week"}
                      onPress={goToNextWeek}
                      disabled={!canGoToNextWeek}
                    />
                  </View>
                  <View style={styles.quickActionsRow}>
                    {entryMode === "monthly" ? (
                      <SmallAction label="Use This Month" onPress={setThisMonth} />
                    ) : entryMode === "daily" ? (
                      <SmallAction label="Use Today" onPress={setToday} />
                    ) : (
                      <SmallAction label="Use This Monday" onPress={setThisMonday} />
                    )}
                    <SmallAction label="Fill Typical Expenses" onPress={fillQuickExpensePreset} />
                  </View>
                  {entryMode === "monthly" ? (
                    <>
                      <Field
                        label="Month Reference Date (DD-MM-YYYY)"
                        value={entryDate}
                        onChange={handleEntryDateChange}
                        placeholder="22-04-2026"
                      />
                      <Text style={styles.noteText}>Monthly bucket: {resolvedWeekStart}</Text>
                      <Text style={styles.noteText}>Use any date inside the month you want to review or submit.</Text>
                    </>
                  ) : entryMode === "daily" ? (
                    <>
                      <Field
                        label="Daily Date (DD-MM-YYYY)"
                        value={entryDate}
                        onChange={handleEntryDateChange}
                        placeholder="22-04-2026"
                      />
                      <Text style={styles.noteText}>Week bucket: {resolvedWeekStart}</Text>
                      <Text style={styles.noteText}>Use the exact day you want to record.</Text>
                    </>
                  ) : (
                    <Field
                      label="Week Start Date (DD-MM-YYYY)"
                      value={weekStartDate}
                      onChange={handleWeekStartDateChange}
                      placeholder="14-04-2026"
                    />
                  )}
                  <Field
                    label="Company providing services for"
                    value={serviceCompany}
                    onChange={setServiceCompany}
                    placeholder="Agency, operator or platform"
                  />
                  <Field
                    label={
                      entryMode === "monthly"
                        ? "Income for this month (£)"
                        : entryMode === "daily"
                          ? "Income for this day (£)"
                          : "Income (£)"
                    }
                    value={income}
                    onChange={setIncome}
                    keyboardType="decimal-pad"
                  />

                  <Text style={styles.subSection}>Expenses</Text>
                  <Text style={styles.noteText}>Add any amounts reimbursed back to you so claimable expenses stay accurate.</Text>
                  <Field label="Fuel (£)" value={fuel} onChange={setFuel} keyboardType="decimal-pad" />
                  <Field
                    label="Fuel Reimbursed (£)"
                    value={fuelReimbursed}
                    onChange={setFuelReimbursed}
                    keyboardType="decimal-pad"
                  />
                  <Field label="Travel (£)" value={travel} onChange={setTravel} keyboardType="decimal-pad" />
                  <Field
                    label="Travel Reimbursed (£)"
                    value={travelReimbursed}
                    onChange={setTravelReimbursed}
                    keyboardType="decimal-pad"
                  />
                  <Field label="Food (£)" value={food} onChange={setFood} keyboardType="decimal-pad" />
                  <Field
                    label="Food Reimbursed (£)"
                    value={foodReimbursed}
                    onChange={setFoodReimbursed}
                    keyboardType="decimal-pad"
                  />
                  <Field label="Other (£)" value={other} onChange={setOther} keyboardType="decimal-pad" />
                  <Field
                    label="Other Reimbursed (£)"
                    value={otherReimbursed}
                    onChange={setOtherReimbursed}
                    keyboardType="decimal-pad"
                  />

                  <View style={styles.previewRow}>
                    <PreviewPill label="Gross expenses" value={expensePreview.totalGross} />
                    <PreviewPill label="Claimable" value={expensePreview.totalClaimable} />
                    <PreviewPill
                      label={entryMode === "monthly" ? "Monthly profit" : entryMode === "daily" ? "Daily profit" : "Weekly profit"}
                      value={expensePreview.profit}
                    />
                  </View>

                  <Text style={styles.noteText}>Use DD-MM-YYYY. Entries default to this month or this Monday, and future dates are blocked.</Text>
                  <Text style={[styles.noteText, { color: colors.accent, fontWeight: "700" }]}>Warning: once submitted, this entry is locked and cannot be changed.</Text>
                  <Text style={styles.noteText}>Expenses reimbursed: £{expensePreview.totalReimbursed.toFixed(2)}</Text>

                  <Pressable
                    onPress={confirmWeeklyEntrySubmission}
                    style={[styles.primaryButton, isSavingWeek && styles.buttonDisabled]}
                    disabled={isSavingWeek}
                  >
                    {isSavingWeek ? (
                      <ActivityIndicator color={colors.accentText} />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {entryMode === "monthly" ? "Save Monthly Entry" : entryMode === "daily" ? "Save Daily Entry" : "Save Weekly Entry"}
                      </Text>
                    )}
                  </Pressable>

                  <View style={styles.saveStatusCard}>
                    <Text style={styles.saveStatusTitle}>Submission status</Text>
                    <Text style={styles.saveStatusText}>
                      {isSavingWeek
                        ? "Saving in progress..."
                        : lastSavedAt
                          ? `Last saved: ${lastSavedAt}`
                          : "Not saved yet for this period."}
                    </Text>
                  </View>

                  {setAside !== null && <Text style={styles.resultText}>Set aside £{setAside.toFixed(2)}</Text>}
                  {estimatedTax !== null && <Text style={styles.resultText}>Estimated tax £{estimatedTax.toFixed(2)}</Text>}

                  <View style={styles.receiptsBlock}>
                    <Text style={styles.subSection}>Receipts</Text>
                    {!currentWeekId && (
                      <Text style={styles.noteText}>Save this entry first to attach receipts.</Text>
                    )}
                    {!!currentWeekId && (
                      <>
                        <Pressable
                          onPress={pickAndUploadReceipt}
                          style={[styles.primaryButton, isUploadingReceipt && styles.buttonDisabled]}
                          disabled={isUploadingReceipt}
                        >
                          {isUploadingReceipt ? (
                            <ActivityIndicator color={colors.accentText} />
                          ) : (
                            <Text style={styles.primaryButtonText}>Upload Receipt (Image/PDF)</Text>
                          )}
                        </Pressable>
                        <Pressable onPress={() => void loadReceipts(currentWeekId)} style={styles.refreshReceiptsButton}>
                          <Text style={styles.refreshReceiptsText}>Refresh Receipts</Text>
                        </Pressable>

                        {isLoadingReceipts && <Text style={styles.noteText}>Loading receipts...</Text>}
                        {!isLoadingReceipts && receipts.length === 0 && (
                          <Text style={styles.noteText}>No receipts uploaded yet.</Text>
                        )}
                        {!isLoadingReceipts && receipts.length > 0 && (
                          <View style={styles.receiptList}>
                            {receipts.map((receipt) => (
                              <Pressable
                                key={receipt.id}
                                onPress={() => void openReceipt(receipt)}
                                style={({ pressed }) => [styles.receiptItem, pressed && styles.receiptItemPressed]}
                                disabled={openingReceiptId === receipt.id}
                              >
                                <View style={styles.receiptRowTop}>
                                  <Text style={styles.receiptName}>{receipt.original_filename}</Text>
                                  {openingReceiptId === receipt.id && <ActivityIndicator size="small" color={colors.textMain} />}
                                </View>
                                <Text style={styles.receiptMeta}>{Math.round(receipt.file_size_bytes / 1024)} KB</Text>
                                <Text style={styles.receiptHint}>Tap to open or share</Text>
                              </Pressable>
                            ))}
                          </View>
                        )}
                      </>
                    )}
                  </View>

                  <Text style={styles.noteText}>
                    {entryMode === "monthly"
                      ? "Monthly entries feed the same monthly and annual tax estimate view."
                      : entryMode === "daily"
                        ? "Daily entries accumulate into weekly and annual tax estimate views."
                        : "Estimate only. Final liability depends on full-year position."}
                  </Text>
                </FormSection>
              )}

              {screen === "summary" && (
                <FormSection title="Year Summary Snapshot">
                  <Field label="Tax Year (e.g. 2026-27)" value={taxYear} onChange={setTaxYear} />
                  <Field
                    label="Snapshot up to (DD-MM-YYYY)"
                    value={summaryAsOfDate}
                    onChange={handleSummaryAsOfDateChange}
                    placeholder="18-04-2026"
                  />
                  <Text style={styles.noteText}>This shows your year-to-date position up to the selected date.</Text>
                  <Pressable
                    onPress={fetchSummary}
                    style={[styles.primaryButton, isLoadingSummary && styles.buttonDisabled]}
                    disabled={isLoadingSummary}
                  >
                    {isLoadingSummary ? (
                      <ActivityIndicator color={colors.accentText} />
                    ) : (
                      <Text style={styles.primaryButtonText}>Load Year Snapshot</Text>
                    )}
                  </Pressable>

                  {summary && (
                    <>
                      <Text style={styles.noteText}>
                        Snapshot up to {formatIsoToDisplayDate(summary.as_of_date || parseDisplayDateToIso(summaryAsOfDate) || getTodayIsoDate())} • {summary.weeks_logged || 0} logged entries.
                      </Text>
                      <View style={styles.summaryBox}>
                        <SummaryRow label="Total income" value={summary.total_income} />
                        <SummaryRow label="Total expenses" value={summary.total_expenses} />
                        <SummaryRow label="Net profit" value={summary.net_profit} />
                        <SummaryRow
                          label="Total tax + NI"
                          value={summary.estimated_income_tax + summary.estimated_ni}
                        />
                      </View>
                      {!!summary.updated_at && (
                        <Text style={styles.noteText}>Summary audit timestamp: {formatAuditTimestamp(summary.updated_at)}</Text>
                      )}
                      {!!summary.weekly_breakdown.length && (
                        <>
                          <Text style={styles.subSection}>Weekly Review</Text>
                          {summary.weekly_breakdown.map((week) => (
                            <View key={week.period_start} style={styles.summaryBox}>
                              <Text style={styles.noteText}>
                                {week.period_label} • {week.entries_logged} logged entries.
                              </Text>
                              <SummaryRow label="Income" value={week.total_income} />
                              <SummaryRow label="Expenses" value={week.total_expenses} />
                              <SummaryRow label="Net profit" value={week.net_profit} />
                            </View>
                          ))}
                        </>
                      )}
                      {!!summary.monthly_breakdown.length && (
                        <>
                          <Text style={styles.subSection}>Monthly Review</Text>
                          {summary.monthly_breakdown.map((month) => (
                            <View key={month.month} style={styles.summaryBox}>
                              <Text style={styles.noteText}>
                                {month.month_label} • {month.entries_logged} logged entries.
                              </Text>
                              <SummaryRow label="Income" value={month.total_income} />
                              <SummaryRow label="Expenses" value={month.total_expenses} />
                              <SummaryRow label="Net profit" value={month.net_profit} />
                            </View>
                          ))}
                        </>
                      )}
                    </>
                  )}

                  {!summary && !isLoadingSummary && (
                    <Text style={styles.noteText}>No year snapshot loaded yet. Choose a date and tap load.</Text>
                  )}
                </FormSection>
              )}

              {screen === "audit" && (
                <FormSection title="Audit Trail">
                  <Field label="Tax Year (e.g. 2026-27)" value={taxYear} onChange={setTaxYear} />
                  <Text style={styles.noteText}>Review every saved entry with attached receipts and ready-to-open files.</Text>
                  <Pressable
                    onPress={fetchAuditTrail}
                    style={[styles.primaryButton, isLoadingAudit && styles.buttonDisabled]}
                    disabled={isLoadingAudit}
                  >
                    {isLoadingAudit ? (
                      <ActivityIndicator color={colors.accentText} />
                    ) : (
                      <Text style={styles.primaryButtonText}>Load Audit Trail</Text>
                    )}
                  </Pressable>

                  {!isLoadingAudit && auditEntries.length === 0 && (
                    <Text style={styles.noteText}>No audit entries loaded yet.</Text>
                  )}

                  {auditEntries.map((entry) => (
                    <View key={entry.id} style={styles.summaryBox}>
                      <Text style={styles.label}>
                        {entry.entry_mode === "monthly" ? "Monthly entry" : "Weekly entry"} • {formatIsoToDisplayDate(entry.week_start_date)}
                      </Text>
                      {!!entry.entry_date && (
                        <Text style={styles.noteText}>Reference date: {formatIsoToDisplayDate(entry.entry_date)}</Text>
                      )}
                      {!!entry.company_providing_services_for && (
                        <Text style={styles.noteText}>Company: {entry.company_providing_services_for}</Text>
                      )}
                      <SummaryRow label="Income" value={entry.income_total} />
                      <SummaryRow label="Expenses" value={entry.total_expenses} />
                      <SummaryRow label="Net profit" value={entry.net_profit} />
                      <Text style={styles.noteText}>Saved at: {formatAuditTimestamp(entry.created_at)}</Text>

                      <Text style={styles.subSection}>Receipts ({entry.receipts.length})</Text>
                      {entry.receipts.length === 0 && <Text style={styles.noteText}>No receipts attached.</Text>}
                      {entry.receipts.length > 0 && (
                        <View style={styles.receiptList}>
                          {entry.receipts.map((receipt) => (
                            <Pressable
                              key={receipt.id}
                              onPress={() => void openReceipt(receipt)}
                              style={({ pressed }) => [styles.receiptItem, pressed && styles.receiptItemPressed]}
                            >
                              <Text style={styles.receiptName}>{receipt.original_filename}</Text>
                              <Text style={styles.receiptMeta}>{Math.round(receipt.file_size_bytes / 1024)} KB</Text>
                              <Text style={styles.receiptHint}>Tap to open or share</Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </FormSection>
              )}

              {screen === "export" && (
                <FormSection title="Export">
                  <Field label="Tax Year (e.g. 2026-27)" value={taxYear} onChange={setTaxYear} />
                  <Pressable
                    onPress={() => {
                      void fetchExport("download");
                    }}
                    style={[styles.primaryButton, isLoadingExport && styles.buttonDisabled]}
                    disabled={isLoadingExport}
                  >
                    {isLoadingExport ? (
                      <ActivityIndicator color={colors.accentText} />
                    ) : (
                      <Text style={styles.primaryButtonText}>Download CSV</Text>
                    )}
                  </Pressable>
                  <View style={styles.quickActionsRow}>
                    <SmallAction
                      label="Email / Share CSV"
                      onPress={() => {
                        void fetchExport("share");
                      }}
                    />
                  </View>
                  <TextInput multiline editable={false} style={styles.exportBox} value={exportData} />
                  {!exportData && !isLoadingExport && (
                    <Text style={styles.noteText}>Choose download or email/share. Your CSV preview will appear here.</Text>
                  )}
                </FormSection>
              )}

              {screen === "admin" && isAdmin && (
                <FormSection title="Admin Tooling">
                  <Text style={styles.noteText}>Use this section to monitor and publish HMRC rule versions.</Text>
                  <Field label="Tax Year (YYYY-YY)" value={taxYear} onChange={setTaxYear} />
                  <Field
                    label="Publish Secret (optional)"
                    value={rulePublishSecretInput}
                    onChange={setRulePublishSecretInput}
                    placeholder="x-rule-publish-secret"
                  />

                  <Pressable
                    onPress={fetchMonitoring}
                    style={[styles.primaryButton, isLoadingMonitoring && styles.buttonDisabled]}
                    disabled={isLoadingMonitoring}
                  >
                    {isLoadingMonitoring ? (
                      <ActivityIndicator color={colors.accentText} />
                    ) : (
                      <Text style={styles.primaryButtonText}>Load Monitoring</Text>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={fetchAuditEvents}
                    style={[styles.primaryButton, isLoadingAuditEvents && styles.buttonDisabled]}
                    disabled={isLoadingAuditEvents}
                  >
                    {isLoadingAuditEvents ? (
                      <ActivityIndicator color={colors.accentText} />
                    ) : (
                      <Text style={styles.primaryButtonText}>Load Audit Events</Text>
                    )}
                  </Pressable>

                  {monitoringData && (
                    <View style={styles.summaryBox}>
                      <Text style={styles.label}>Active Version: {monitoringData.active_rule_set.version}</Text>
                      <Text style={styles.noteText}>Effective from: {monitoringData.active_rule_set.effective_from}</Text>
                      <Text style={styles.noteText}>
                        Source: {monitoringData.active_rule_set.source_reference || "Not set"}
                      </Text>
                      <Text style={styles.noteText}>Versions: {monitoringData.available_versions.join(", ")}</Text>
                      <Text style={styles.noteText}>Rule review: {monitoringData.review.status}</Text>
                      <Text style={styles.noteText}>{monitoringData.review.message}</Text>
                      {monitoringData.review.signals.map((signal) => (
                        <Text key={signal} style={styles.noteText}>• {signal}</Text>
                      ))}
                    </View>
                  )}

                  <Text style={styles.subSection}>Publish Next Rule Version</Text>
                  <Field
                    label="Effective From (DD-MM-YYYY)"
                    value={publishEffectiveFrom}
                    onChange={handlePublishEffectiveFromChange}
                  />
                  <Field
                    label="Source Reference URL"
                    value={publishSourceReference}
                    onChange={setPublishSourceReference}
                  />
                  <Field label="Notes" value={publishNotes} onChange={setPublishNotes} />
                  <Field
                    label="Personal Allowance"
                    value={publishPersonalAllowance}
                    onChange={setPublishPersonalAllowance}
                    keyboardType="decimal-pad"
                  />
                  <Field
                    label="Basic Rate Limit"
                    value={publishBasicRateLimit}
                    onChange={setPublishBasicRateLimit}
                    keyboardType="decimal-pad"
                  />
                  <Field
                    label="Basic Rate"
                    value={publishBasicRate}
                    onChange={setPublishBasicRate}
                    keyboardType="decimal-pad"
                  />
                  <Field
                    label="Higher Rate"
                    value={publishHigherRate}
                    onChange={setPublishHigherRate}
                    keyboardType="decimal-pad"
                  />
                  <Field
                    label="NI Class 2 Weekly"
                    value={publishNiClass2Weekly}
                    onChange={setPublishNiClass2Weekly}
                    keyboardType="decimal-pad"
                  />
                  <Field
                    label="NI Class 4 Threshold"
                    value={publishNiClass4Threshold}
                    onChange={setPublishNiClass4Threshold}
                    keyboardType="decimal-pad"
                  />
                  <Field
                    label="NI Class 4 Rate"
                    value={publishNiClass4Rate}
                    onChange={setPublishNiClass4Rate}
                    keyboardType="decimal-pad"
                  />

                  <Pressable
                    onPress={publishRuleVersion}
                    style={[styles.primaryButton, isPublishingRule && styles.buttonDisabled]}
                    disabled={isPublishingRule}
                  >
                    {isPublishingRule ? (
                      <ActivityIndicator color={colors.accentText} />
                    ) : (
                      <Text style={styles.primaryButtonText}>Publish Rule Version</Text>
                    )}
                  </Pressable>

                  <Text style={styles.subSection}>Recent Audit Events</Text>
                  {auditEvents.length === 0 && !isLoadingAuditEvents && (
                    <Text style={styles.noteText}>No audit events loaded yet.</Text>
                  )}
                  {auditEvents.length > 0 && (
                    <View style={styles.receiptList}>
                      {auditEvents.map((event) => (
                        <View key={event.id} style={styles.receiptItem}>
                          <Text style={styles.receiptName}>{event.event_type}</Text>
                          <Text style={styles.receiptMeta}>{event.performed_at}</Text>
                          <Text style={styles.receiptMeta}>By: {event.performed_by || "system"}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <Text style={styles.subSection}>User Role Access</Text>
                  <Field
                    label="Target User Email"
                    value={adminTargetEmail}
                    onChange={setAdminTargetEmail}
                    placeholder="user@example.com"
                  />
                  <View style={styles.quickActionsRow}>
                    <SmallAction label="Set Admin" onPress={() => setAdminTargetRole("admin")} active={adminTargetRole === "admin"} />
                    <SmallAction label="Set User" onPress={() => setAdminTargetRole("user")} active={adminTargetRole === "user"} />
                  </View>
                  <Text style={styles.noteText}>Selected role: {adminTargetRole}</Text>
                  <Pressable
                    onPress={updateUserRole}
                    style={[styles.primaryButton, isUpdatingUserRole && styles.buttonDisabled]}
                    disabled={isUpdatingUserRole}
                  >
                    {isUpdatingUserRole ? (
                      <ActivityIndicator color={colors.accentText} />
                    ) : (
                      <Text style={styles.primaryButtonText}>Update User Role</Text>
                    )}
                  </Pressable>
                </FormSection>
              )}

              {screen === "guide" && (
                <FormSection title="User Guide & FAQ">
                  <Text style={styles.subSection}>Quick User Guide</Text>
                  <Text style={styles.guideItem}>1. Sign in or create your account.</Text>
                  <Text style={styles.guideItem}>2. Choose daily, weekly, or monthly mode, then enter income and expenses.</Text>
                  <Text style={styles.guideItem}>3. Add any reimbursed expenses so the claimable total stays accurate.</Text>
                  <Text style={styles.guideItem}>4. Confirm the submission warning before saving your locked record.</Text>
                  <Text style={styles.guideItem}>5. Upload receipts after saving the weekly entry.</Text>
                  <Text style={styles.guideItem}>6. Use Year Summary and Export for annual review and records.</Text>

                  <Text style={styles.subSection}>FAQ</Text>
                  <Text style={styles.faqQuestion}>Why is my entry locked after save?</Text>
                  <Text style={styles.noteText}>
                    Entries are intentionally locked after confirmation for compliance traceability and audit reliability.
                  </Text>

                  <Text style={styles.faqQuestion}>How do reimbursed expenses work?</Text>
                  <Text style={styles.noteText}>
                    Reimbursed amounts are removed from the claimable expense total so your estimate stays more accurate.
                  </Text>

                  <Text style={styles.faqQuestion}>Are tax values final HMRC liabilities?</Text>
                  <Text style={styles.noteText}>
                    No. They are estimates based on your current rule set and logged data.
                  </Text>

                  <Text style={styles.faqQuestion}>Why do I see compliance warnings?</Text>
                  <Text style={styles.noteText}>
                    Warnings highlight patterns that often need stronger evidence or review before filing.
                  </Text>

                  <Text style={styles.faqQuestion}>How do admins update rule sets?</Text>
                  <Text style={styles.noteText}>
                    Open Admin tab, review monitoring, then publish the next version. Changes are audit logged.
                  </Text>

                  <Text style={styles.subSection}>Security</Text>
                  <Text style={styles.noteText}>
                    Two-step verification is currently {twoFactorEnabled ? "enabled" : "not enabled"} for this account.
                  </Text>

                  {!twoFactorEnabled && !twoFactorSetupKey && (
                    <Pressable
                      onPress={startTwoFactorSetup}
                      style={[styles.primaryButton, isLoadingTwoFactor && styles.buttonDisabled]}
                      disabled={isLoadingTwoFactor}
                    >
                      {isLoadingTwoFactor ? (
                        <ActivityIndicator color={colors.accentText} />
                      ) : (
                        <Text style={styles.primaryButtonText}>Start 2-Step Verification</Text>
                      )}
                    </Pressable>
                  )}

                  {!twoFactorEnabled && !!twoFactorSetupKey && (
                    <>
                      <Text style={styles.noteText}>Manual setup key: {twoFactorSetupKey}</Text>
                      {!!twoFactorSetupUri && (
                        <Text style={styles.noteText}>Authenticator setup data is ready for QR-compatible tools.</Text>
                      )}
                      <Field
                        label="Authenticator Code"
                        value={twoFactorCode}
                        onChange={setTwoFactorCode}
                        placeholder="6-digit code"
                      />
                      <Pressable
                        onPress={enableTwoFactor}
                        style={[styles.primaryButton, isLoadingTwoFactor && styles.buttonDisabled]}
                        disabled={isLoadingTwoFactor}
                      >
                        {isLoadingTwoFactor ? (
                          <ActivityIndicator color={colors.accentText} />
                        ) : (
                          <Text style={styles.primaryButtonText}>Enable 2-Step Verification</Text>
                        )}
                      </Pressable>
                    </>
                  )}

                  {twoFactorEnabled && (
                    <>
                      <Text style={styles.noteText}>
                        Open your authenticator app to confirm sensitive account changes.
                      </Text>
                      <Field
                        label="Authenticator Code"
                        value={twoFactorCode}
                        onChange={setTwoFactorCode}
                        placeholder="6-digit code"
                      />
                      <Pressable
                        onPress={disableTwoFactor}
                        style={[styles.primaryButton, isLoadingTwoFactor && styles.buttonDisabled]}
                        disabled={isLoadingTwoFactor}
                      >
                        {isLoadingTwoFactor ? (
                          <ActivityIndicator color={colors.accentText} />
                        ) : (
                          <Text style={styles.primaryButtonText}>Disable 2-Step Verification</Text>
                        )}
                      </Pressable>
                    </>
                  )}
                </FormSection>
              )}

              {screen === "settings" && (
                <SettingsScreen
                  email={authUser?.email || ""}
                  currentWeekStartDate={resolvedWeekStart}
                  entryMode={entryMode}
                  onClearWeek={clearWeekData}
                  onClearAll={clearAllData}
                />
              )}
            </Animated.ScrollView>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  keyboardWrap: {
    flex: 1
  },
  backgroundOrnamentOne: {
    position: "absolute",
    top: -70,
    right: -30,
    width: 210,
    height: 210,
    borderRadius: 110,
    backgroundColor: colors.ornamentWarm,
    opacity: 0.2
  },
  backgroundOrnamentTwo: {
    position: "absolute",
    bottom: 80,
    left: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.ornamentCool,
    opacity: 0.18
  },
  container: {
    padding: spacing.xxl,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl
  },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: colors.inputBg
  },
  authTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.textMain,
    marginBottom: spacing.sm
  },
  signedInEmail: {
    color: colors.textMain,
    fontWeight: "700",
    fontSize: typography.body + 1,
    marginBottom: spacing.sm
  },
  smallSignOutButton: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft
  },
  smallSignOutText: {
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: typography.small
  },
  subSection: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "700",
    color: colors.sectionHint
  },
  label: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: "600"
  },
  previewRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    marginBottom: 6
  },
  receiptsBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.inputBorder
  },
  refreshReceiptsButton: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft
  },
  refreshReceiptsText: {
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: typography.small
  },
  receiptList: {
    marginTop: spacing.sm,
    gap: spacing.sm
  },
  receiptItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoftAlt
  },
  receiptItemPressed: {
    opacity: 0.75
  },
  receiptRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm
  },
  receiptName: {
    color: colors.textMain,
    fontWeight: "700",
    fontSize: typography.body
  },
  receiptMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: typography.small
  },
  receiptHint: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: "600"
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10
  },
  periodSegment: {
    flexDirection: "row",
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
    marginBottom: 10
  },
  periodSegmentOption: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: "center"
  },
  periodSegmentOptionActive: {
    backgroundColor: colors.accent
  },
  periodSegmentOptionDisabled: {
    opacity: 0.45
  },
  periodSegmentText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: "700"
  },
  periodSegmentTextActive: {
    color: colors.accentText
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonDisabled: {
    opacity: 0.7
  },
  primaryButtonText: {
    color: colors.accentText,
    fontWeight: "700"
  },
  switchModeButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: "center"
  },
  switchModeText: {
    color: colors.navTextActive,
    fontWeight: "600",
    fontSize: typography.small
  },
  resultText: {
    marginTop: 8,
    color: colors.snapshotValue,
    fontSize: 16,
    fontWeight: "600"
  },
  saveStatusCard: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.accentSoftAlt,
    padding: spacing.md
  },
  saveStatusTitle: {
    fontSize: typography.small,
    color: colors.textMain,
    fontWeight: "700"
  },
  saveStatusText: {
    marginTop: 4,
    fontSize: typography.small,
    color: colors.textSecondary,
    fontWeight: "600"
  },
  noteText: {
    marginTop: 10,
    color: colors.textNote,
    fontSize: typography.small,
    lineHeight: 18
  },
  guideItem: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: typography.body,
    lineHeight: 18,
    fontWeight: "600"
  },
  faqQuestion: {
    marginTop: 12,
    color: colors.textMain,
    fontSize: typography.body,
    fontWeight: "700"
  },
  summaryBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.summaryBg
  },
  exportBox: {
    marginTop: 10,
    minHeight: 220,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    padding: 10,
    textAlignVertical: "top"
  }
});
