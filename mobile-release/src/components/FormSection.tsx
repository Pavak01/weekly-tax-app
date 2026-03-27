import React from "react";
import { StyleSheet, Text } from "react-native";
import { Card } from "./Controls";
import { colors, spacing, typography } from "../theme/tokens";

export function FormSection({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Card>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    marginBottom: spacing.md,
    color: colors.textMain
  }
});
