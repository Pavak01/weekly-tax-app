import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { NavButton } from "./Controls";
import { colors, radius, spacing, typography } from "../theme/tokens";

type Screen = "week" | "summary" | "export" | "admin" | "guide";

export function AppHeader({
  screen,
  onChange
}: {
  screen: Screen;
  onChange: (next: Screen) => void;
}): React.JSX.Element {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>Weekly Tax App</Text>
      <Text style={styles.title}>Simple weekly records, clear set-aside guidance.</Text>
      <View style={styles.navRow}>
        <NavButton label="This Week" active={screen === "week"} onPress={() => onChange("week")} />
        <NavButton label="Year Summary" active={screen === "summary"} onPress={() => onChange("summary")} />
        <NavButton label="Export" active={screen === "export"} onPress={() => onChange("export")} />
        <NavButton label="Admin" active={screen === "admin"} onPress={() => onChange("admin")} />
        <NavButton label="Guide" active={screen === "guide"} onPress={() => onChange("guide")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.navTextActive,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl
  },
  eyebrow: {
    color: colors.accentText,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontSize: typography.micro,
    fontWeight: "700",
    marginBottom: spacing.sm
  },
  title: {
    fontSize: typography.h1,
    fontWeight: "700",
    color: colors.accentText,
    marginBottom: spacing.lg,
    lineHeight: 30
  },
  navRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap"
  }
});
