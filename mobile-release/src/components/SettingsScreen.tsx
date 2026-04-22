import React, { useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, DangerAction } from "./Controls";
import { colors, spacing, typography } from "../theme/tokens";

type SettingsScreenProps = {
  email: string;
  onClearWeek: (weekStartDate: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  currentWeekStartDate: string;
  entryMode: "weekly" | "monthly";
  isLoading?: boolean;
};

export function SettingsScreen({
  email,
  onClearWeek,
  onClearAll,
  currentWeekStartDate,
  entryMode,
  isLoading = false
}: SettingsScreenProps): React.JSX.Element {
  const [clearingWeek, setClearingWeek] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const periodLabel = entryMode === "monthly" ? "month" : "week";
  const clearCurrentLabel = entryMode === "monthly" ? "Clear This Month" : "Clear This Week";
  const browserApi = globalThis as typeof globalThis & {
    alert?: (message?: string) => void;
    confirm?: (message?: string) => boolean;
  };

  function showMessage(title: string, message: string): void {
    if (Platform.OS === "web" && typeof browserApi.alert === "function") {
      browserApi.alert(`${title}\n\n${message}`);
      return;
    }

    Alert.alert(title, message);
  }

  function confirmAction(title: string, message: string, onConfirm: () => void): void {
    if (Platform.OS === "web" && typeof browserApi.confirm === "function") {
      if (browserApi.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
      return;
    }

    Alert.alert(title, message, [
      { text: "Cancel", onPress: () => {}, style: "cancel" },
      {
        text: "Delete",
        onPress: onConfirm,
        style: "destructive"
      }
    ]);
  }

  const handleClearThisWeek = (): void => {
    confirmAction(
      `Clear This ${entryMode === "monthly" ? "Month" : "Week"}?`,
      `This will delete all entries for this ${periodLabel}. This action cannot be undone.`,
      async () => {
        setClearingWeek(true);
        try {
          await onClearWeek(currentWeekStartDate);
          showMessage("Success", `This ${periodLabel}'s data has been cleared.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : `Failed to clear this ${periodLabel}'s data.`;
          showMessage("Error", message);
        } finally {
          setClearingWeek(false);
        }
      }
    );
  };

  const handleClearAll = (): void => {
    confirmAction(
      "Clear All Data?",
      "This will permanently delete ALL your entries and cannot be undone. Your account will remain active.",
      async () => {
        setClearingAll(true);
        try {
          await onClearAll();
          showMessage("Success", "All your data has been cleared. You can start fresh.");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to clear all data.";
          showMessage("Error", message);
        } finally {
          setClearingAll(false);
        }
      }
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.label}>Account</Text>
        <Text style={styles.email}>{email}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Data Management</Text>
        <View style={styles.actionGroup}>
          <DangerAction
            label={clearCurrentLabel}
            sublabel={`Delete all entries for the current ${periodLabel}`}
            onPress={handleClearThisWeek}
            disabled={clearingWeek || clearingAll}
            isLoading={clearingWeek}
          />
          <View style={styles.separator} />
          <DangerAction
            label="Clear All Data"
            sublabel="Permanently delete all entries (cannot be undone)"
            onPress={handleClearAll}
            disabled={clearingWeek || clearingAll}
            isLoading={clearingAll}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>App Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>App Name</Text>
          <Text style={styles.infoValue}>Qbit</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Purpose</Text>
          <Text style={styles.infoValue}>Weekly and monthly tax tracking</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: spacing.md
  },
  label: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.textMain,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  email: {
    fontSize: typography.body,
    color: colors.textSecondary
  },
  actionGroup: {
    gap: spacing.md
  },
  separator: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: spacing.sm
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm
  },
  infoLabel: {
    fontSize: typography.small,
    color: colors.textSecondary
  },
  infoValue: {
    fontSize: typography.small,
    fontWeight: "500",
    color: colors.textMain
  }
});
