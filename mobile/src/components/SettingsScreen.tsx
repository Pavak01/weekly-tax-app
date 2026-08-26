import React, { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { DangerAction } from "./Controls";
import { colors, spacing, typography } from "../theme/tokens";

type SettingsScreenProps = {
  email: string;
  onClearWeek: (weekStartDate: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  currentWeekStartDate: string;
  entryMode: "weekly" | "monthly" | "daily";
  isLoading?: boolean;
  apiBaseUrl?: string;
};

export function SettingsScreen({
  email,
  onClearWeek,
  onClearAll,
  currentWeekStartDate,
  entryMode,
  isLoading = false,
  apiBaseUrl = "http://localhost:4000"
}: SettingsScreenProps): React.JSX.Element {
  const [clearingWeek, setClearingWeek] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [pendingAction, setPendingAction] = useState<"current" | "all" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deletionFullName, setDeletionFullName] = useState("");
  const [deletionMessage, setDeletionMessage] = useState("");
  const [isSubmittingDeletion, setIsSubmittingDeletion] = useState(false);
  const [deletionResult, setDeletionResult] = useState<"success" | "error" | null>(null);
  const periodLabel = entryMode === "monthly" ? "month" : entryMode === "daily" ? "day" : "week";
  const clearCurrentLabel =
    entryMode === "monthly" ? "Clear This Month" : entryMode === "daily" ? "Clear This Day" : "Clear This Week";
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

  function openConfirmation(action: "current" | "all"): void {
    setPendingAction(action);
    setConfirmText("");
  }

  function closeConfirmation(): void {
    setPendingAction(null);
    setConfirmText("");
  }

  async function executeClearCurrent(): Promise<void> {
    setClearingWeek(true);
    try {
      await onClearWeek(currentWeekStartDate);
      showMessage("Success", `This ${periodLabel}'s data has been cleared.`);
      closeConfirmation();
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to clear this ${periodLabel}'s data.`;
      showMessage("Error", message);
    } finally {
      setClearingWeek(false);
    }
  }

  async function executeClearAll(): Promise<void> {
    setClearingAll(true);
    try {
      await onClearAll();
      showMessage("Success", "All your data has been cleared. You can start fresh.");
      closeConfirmation();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear all data.";
      showMessage("Error", message);
    } finally {
      setClearingAll(false);
    }
  }

  const handleClearThisWeek = (): void => {
    confirmAction(
      `Continue to clear this ${entryMode === "monthly" ? "month" : entryMode === "daily" ? "day" : "week"}?`,
      "You will be asked for a final typed confirmation on the next step.",
      () => openConfirmation("current")
    );
  };

  const handleClearAll = (): void => {
    confirmAction(
      "Continue to clear all data?",
      "You will be asked for a final typed confirmation on the next step.",
      () => openConfirmation("all")
    );
  };

  const expectedPhrase = pendingAction === "all" ? "DELETE ALL" : "CLEAR";
  const canConfirmTypedAction = confirmText.trim().toUpperCase() === expectedPhrase;

  async function submitDeletionRequest(): Promise<void> {
    if (!deletionFullName.trim()) {
      showMessage("Validation", "Please enter your full name.");
      return;
    }

    setIsSubmittingDeletion(true);
    setDeletionResult(null);

    try {
      const response = await fetch(`${apiBaseUrl}/auth/account-deletion-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          fullName: deletionFullName,
          message: deletionMessage || null
        })
      });

      if (response.ok) {
        setDeletionResult("success");
        setDeletionFullName("");
        setDeletionMessage("");
      } else {
        setDeletionResult("error");
      }
    } catch (error) {
      setDeletionResult("error");
    } finally {
      setIsSubmittingDeletion(false);
    }
  }

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
        <Text style={styles.safetyHint}>Receipts linked to deleted entries are removed automatically.</Text>
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

        {pendingAction && (
          <View style={styles.confirmationCard}>
            <Text style={styles.confirmationTitle}>
              {pendingAction === "all" ? "Final confirmation: clear all" : `Final confirmation: clear this ${periodLabel}`}
            </Text>
            <Text style={styles.confirmationHint}>
              Type <Text style={styles.confirmationCode}>{expectedPhrase}</Text> to enable deletion.
            </Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              style={styles.confirmationInput}
              autoCapitalize="characters"
              placeholder={`Type ${expectedPhrase}`}
              editable={!clearingWeek && !clearingAll}
            />
            <View style={styles.confirmationActions}>
              <Pressable
                onPress={closeConfirmation}
                style={styles.cancelButton}
                disabled={clearingWeek || clearingAll}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (pendingAction === "all") {
                    void executeClearAll();
                    return;
                  }
                  void executeClearCurrent();
                }}
                disabled={!canConfirmTypedAction || clearingWeek || clearingAll}
                style={[
                  styles.confirmDeleteButton,
                  (!canConfirmTypedAction || clearingWeek || clearingAll) && styles.confirmDeleteButtonDisabled
                ]}
              >
                <Text style={styles.confirmDeleteButtonText}>
                  {pendingAction === "all" ? "Delete all now" : `Delete this ${periodLabel}`}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Request Account Deletion</Text>
        <Text style={styles.safetyHint}>Submit a request to permanently delete your account and data.</Text>

        {deletionResult === "success" ? (
          <Text style={[styles.noteText, { color: "#059669", marginTop: 12 }]}>
            ✓ Request submitted. We will process it within 30 days.
          </Text>
        ) : deletionResult === "error" ? (
          <Text style={[styles.noteText, { color: "#dc2626", marginTop: 12 }]}>
            Failed to submit. Please try again.
          </Text>
        ) : (
          <>
            <Text style={styles.noteText}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={deletionFullName}
              onChangeText={setDeletionFullName}
              placeholder="Your full name"
              editable={!isSubmittingDeletion}
            />
            <Text style={styles.noteText}>Message (optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              value={deletionMessage}
              onChangeText={setDeletionMessage}
              placeholder="Any additional details..."
              multiline
              editable={!isSubmittingDeletion}
            />
            <Pressable
              onPress={submitDeletionRequest}
              style={[styles.dangerButton, isSubmittingDeletion && styles.dangerButtonDisabled]}
              disabled={isSubmittingDeletion}
            >
              {isSubmittingDeletion ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.dangerButtonText}>Submit Deletion Request</Text>
              )}
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>App Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>App Name</Text>
          <Text style={styles.infoValue}>Qbit</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Purpose</Text>
          <Text style={styles.infoValue}>Daily, weekly, and monthly tax tracking</Text>
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
  safetyHint: {
    fontSize: typography.small,
    color: colors.textSecondary,
    marginTop: -spacing.xs
  },
  separator: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: spacing.sm
  },
  confirmationCard: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 12,
    backgroundColor: "#fff2f2",
    padding: spacing.md,
    gap: spacing.sm
  },
  confirmationTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.danger
  },
  confirmationHint: {
    fontSize: typography.small,
    color: colors.textSecondary
  },
  confirmationCode: {
    fontWeight: "700",
    color: colors.danger
  },
  confirmationInput: {
    borderWidth: 1,
    borderColor: "#e19a98",
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  confirmationActions: {
    flexDirection: "row",
    gap: spacing.sm
  },
  cancelButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    paddingVertical: spacing.sm,
    backgroundColor: colors.card
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: "700"
  },
  confirmDeleteButton: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: spacing.sm,
    backgroundColor: colors.danger
  },
  confirmDeleteButtonDisabled: {
    opacity: 0.45
  },
  confirmDeleteButtonText: {
    color: "#fff",
    fontSize: typography.small,
    fontWeight: "700"
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
  },
  input: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textMain,
    marginBottom: spacing.sm
  },
  noteText: {
    fontSize: typography.small,
    color: colors.textSecondary,
    marginBottom: 6,
    fontWeight: "500"
  },
  dangerButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    backgroundColor: "#dc2626",
    alignItems: "center"
  },
  dangerButtonDisabled: {
    opacity: 0.5
  },
  dangerButtonText: {
    color: "#fff",
    fontSize: typography.small,
    fontWeight: "700"
  }
});
