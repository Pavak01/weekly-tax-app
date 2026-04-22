import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NavButton } from "./Controls";
import { colors, radius, spacing, typography } from "../theme/tokens";

type Screen = "week" | "summary" | "audit" | "export" | "admin" | "guide" | "settings";

export function AppHeader({
  screen,
  onChange,
  isAdmin = false
}: {
  screen: Screen;
  onChange: (next: Screen) => void;
  isAdmin?: boolean;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);

  function handleNavigate(next: Screen): void {
    onChange(next);
    setMenuOpen(false);
  }

  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>Qbit</Text>
      <View style={styles.topRow}>
        <Text style={styles.title}>Earnings & Expense Log</Text>
        <Pressable
          style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}
          onPress={() => setMenuOpen((open) => !open)}
        >
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </Pressable>
      </View>

      {menuOpen && (
        <View style={styles.menuPanel}>
          <View style={styles.navRow}>
            <NavButton label="This Week" active={screen === "week"} onPress={() => handleNavigate("week")} />
            <NavButton label="Year Summary" active={screen === "summary"} onPress={() => handleNavigate("summary")} />
            <NavButton label="Audit" active={screen === "audit"} onPress={() => handleNavigate("audit")} />
            <NavButton label="Export" active={screen === "export"} onPress={() => handleNavigate("export")} />
            {isAdmin && <NavButton label="Admin" active={screen === "admin"} onPress={() => handleNavigate("admin")} />}
            <NavButton label="Guide" active={screen === "guide"} onPress={() => handleNavigate("guide")} />
          </View>
          <View style={styles.menuDivider} />
          <View style={styles.settingsRow}>
            <NavButton label="Settings" active={screen === "settings"} onPress={() => handleNavigate("settings")} />
          </View>
        </View>
      )}
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
    lineHeight: 30
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
    gap: spacing.md
  },
  menuButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.navText,
    backgroundColor: colors.navBg,
    justifyContent: "center",
    alignItems: "center",
    gap: 4
  },
  menuButtonPressed: {
    opacity: 0.8
  },
  menuLine: {
    width: 20,
    height: 2,
    borderRadius: radius.round,
    backgroundColor: colors.accentText
  },
  menuPanel: {
    borderWidth: 1,
    borderColor: colors.navText,
    borderRadius: radius.lg,
    padding: spacing.sm,
    backgroundColor: colors.navBg,
    gap: spacing.sm
  },
  navRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap"
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.navText,
    opacity: 0.45
  },
  settingsRow: {
    flexDirection: "row",
    justifyContent: "flex-end"
  }
});
