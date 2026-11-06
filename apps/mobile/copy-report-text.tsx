import { useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { setStringAsync } from 'expo-clipboard';
import { reportClipboardCopy, type Locale, type ReportClipboardKind } from '@fieldwork/strings';
import { Button, Copy } from './notebook-ui';
import { Check, CopyIcon } from './notebook-icons';
import { spacing } from './theme';

export default function CopyReportText({
  children,
  text,
  kind,
  locale,
}: {
  children: ReactNode;
  text: string;
  kind: ReportClipboardKind;
  locale: Locale;
}) {
  const copy = reportClipboardCopy[locale][kind];
  const [copied, setCopied] = useState<boolean>();
  async function copyText() {
    const success = await setStringAsync(text).catch(() => false);
    setCopied(success);
    AccessibilityInfo.announceForAccessibility(success ? copy.copied : copy.failed);
  }
  return (
    <>
      <View style={styles.row}>
        <View style={styles.content}>{children}</View>
        {text.trim().length > 0 && (
          <Button
            title={copied ? copy.copied : copy.label}
            accessibilityLabel={copy.label}
            icon={copied ? Check : CopyIcon}
            iconOnly
            variant="ghost"
            onPress={() => void copyText()}
          />
        )}
      </View>
      {copied === false && <Copy muted>{copy.failed}</Copy>}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  content: { flexShrink: 1 },
});
