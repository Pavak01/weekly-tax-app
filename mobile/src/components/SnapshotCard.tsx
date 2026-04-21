import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card, SnapshotTile } from "./Controls";
import { colors, spacing, typography } from "../theme/tokens";

export function SnapshotCard({
  setAside,
  estimatedTax,
  claimable,
  profit,
  lastSavedAt
}: {
  setAside: string;
  estimatedTax: string;
  claimable: string;
  profit: string;
  lastSavedAt: string | null;
}): React.JSX.Element {
  return (
    <Card>
      <Text style={styles.sectionTitle}>Weekly Snapshot</Text>
      <View style={styles.snapshotGrid}>
        <SnapshotTile label="Set Aside" value={setAside} />
        <SnapshotTile label="Est. Tax + NI" value={estimatedTax} />
        <SnapshotTile label="Claimable" value={claimable} />
        <SnapshotTile label="Profit" value={profit} />
      </View>
      {!!lastSavedAt && <Text style={styles.helperText}>Last audit timestamp: {lastSavedAt}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    marginBottom: spacing.md,
    color: colors.textMain
  },
  snapshotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  helperText: {
    marginTop: 6,
    fontSize: typography.small,
    color: colors.textMuted
  }
});
