import React, { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, DangerAction } from "./Controls";
import { colors, spacing, typography } from "../theme/tokens";

type SettingsScreenProps = {
  email: string;
  onClearWeek: (weekStartDate: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  currentWeekStartDate: string;
  isLoading?: boolean;
};

export function SettingsScreen({
  email,
  onClearWeek,
  onClearAll,
  currentWeekStartDate,
  isLoading = false
}: SettingsScreenProps): React.JSX.Element {
  const [clearingWeek, setClearingWeek] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const handleClearThisWeek = (): void => {
    Alert.alert(
      "Clear This Week?",
      "This will delete all entries for this week. This action cannot be undone.",
      [
        { text: "Cancel", onPress: () => {}, style: "cancel" },
        {
          text: "Delete",
          onPress: async () => {
            setClearingWeek(true);
            try {
              await onClearWeek(currentWeekStartDate);
              Alert.alert("Success", "This week's data has been cleared.");
            } catch (error) {
              Alert.alert("Error", "Failed to clear this week's data.");
            } finally {
              setClearingWeek(false);
            }
          },
          style: "destructive"
        }
      ]
    );
  };

  const handleClearAll = (): void => {
    Alert.alert(
      "Clear All Data?",
      "This will permanently delete ALL your entries and cannot be undone. Your account will remain active.",
      [
        { text: "Cancel", onPress: () => {}, style: "cancel" },
        {
          text: "Delete All",
          onPress: async () => {
            setClearingAll(true);
            try {
              await onClearAll();
              Alert.alert("Success", "All your data has been cleared. You can start fresh.");
            } catch (error) {
              Alert.alert("Error", "Failed to clear all data.");
            } finally {
              setClearingAll(false);
            }
          },
          style: "destructive"
        }
      ]
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
            label="Clear This Week"
            sublabel="Delete all entries for the current week"
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
          <Text style={styles.infoValue}>Weekly tax tracking</Text>
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
