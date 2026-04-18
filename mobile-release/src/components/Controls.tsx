import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type { KeyboardTypeOptions } from "react-native";
import { colors, radius, typography } from "../theme/tokens";

export function Card({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <View style={styles.card}>{children}</View>;
}

export function Field({
  label,
  value,
  onChange,
  keyboardType,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
}): React.JSX.Element {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={styles.input}
        keyboardType={keyboardType}
        placeholder={placeholder}
      />
    </View>
  );
}

export function StatusBanner({ kind, text }: { kind: "info" | "error"; text: string }): React.JSX.Element {
  return (
    <View style={[styles.statusBanner, kind === "error" ? styles.statusError : styles.statusInfo]}>
      <Text style={styles.statusText}>{text}</Text>
    </View>
  );
}

export function SnapshotTile({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.snapshotTile}>
      <Text style={styles.snapshotLabel}>{label}</Text>
      <Text style={styles.snapshotValue}>{value}</Text>
    </View>
  );
}

export function SmallAction({
  label,
  onPress,
  active = false,
  disabled = false
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.smallActionButton, active && styles.smallActionButtonActive, disabled && styles.smallActionButtonDisabled]}
    >
      <Text style={[styles.smallActionText, active && styles.smallActionTextActive, disabled && styles.smallActionTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function PreviewPill({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <View style={styles.previewPill}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={styles.previewValue}>£{value.toFixed(2)}</Text>
    </View>
  );
}

export function SummaryRow({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>£{value.toFixed(2)}</Text>
    </View>
  );
}

export function NavButton({
  label,
  active,
  onPress
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.navButton, active && styles.navButtonActive]}>
      <Text style={[styles.navButtonText, active && styles.navButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder
  },
  fieldWrap: {
    marginBottom: 10
  },
  label: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: "600"
  },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: colors.inputBg
  },
  statusBanner: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radius.md
  },
  statusInfo: {
    backgroundColor: colors.successBg
  },
  statusError: {
    backgroundColor: colors.errorBg
  },
  statusText: {
    color: colors.statusText,
    fontWeight: "600"
  },
  snapshotTile: {
    width: "48%",
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingVertical: 9,
    paddingHorizontal: 10
  },
  snapshotLabel: {
    fontSize: typography.micro,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: "700"
  },
  snapshotValue: {
    fontSize: 15,
    color: colors.snapshotValue,
    fontWeight: "700"
  },
  smallActionButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.cardBorder
  },
  smallActionButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  smallActionButtonDisabled: {
    opacity: 0.45
  },
  smallActionText: {
    fontSize: typography.small,
    color: colors.sectionHint,
    fontWeight: "700"
  },
  smallActionTextActive: {
    color: colors.accentText
  },
  smallActionTextDisabled: {
    color: colors.textSecondary
  },
  previewPill: {
    flex: 1,
    backgroundColor: colors.accentSoftAlt,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 8
  },
  previewLabel: {
    fontSize: typography.micro,
    color: colors.sectionHint,
    marginBottom: 4,
    fontWeight: "600"
  },
  previewValue: {
    color: colors.snapshotValue,
    fontWeight: "700",
    fontSize: 14
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontWeight: "600"
  },
  summaryValue: {
    color: colors.snapshotValue,
    fontWeight: "700"
  },
  navButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.navBg
  },
  navButtonActive: {
    backgroundColor: colors.navActiveBg
  },
  navButtonText: {
    color: colors.navText,
    fontSize: typography.body,
    fontWeight: "600"
  },
  navButtonTextActive: {
    color: colors.navTextActive
  }
});
