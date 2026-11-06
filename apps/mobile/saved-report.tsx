import { useState } from 'react';
import { AccessibilityInfo, Image, StyleSheet, View } from 'react-native';
import { setStringAsync } from 'expo-clipboard';
import { answerLabel, reportItemLabel, type WorkOrder } from '@fieldwork/contracts';
import { inspectionCopy, languageTags, type Locale } from '@fieldwork/strings';
import { Button, Copy, Panel, SectionHeading } from './notebook-ui';
import { Check, CopyIcon } from './notebook-icons';
import { colors, radius, size, spacing } from './theme';

export default function SavedReport({
  report,
  template,
  baseUrl,
  token,
  locale,
}: {
  report: NonNullable<WorkOrder['report']>;
  template: WorkOrder['template'];
  baseUrl: string;
  token: string;
  locale: Locale;
}) {
  const copy = inspectionCopy[locale];
  const dateLocale = languageTags[locale];
  const [copyResult, setCopyResult] = useState<{ reportId: string; copied: boolean }>();
  const copied = copyResult?.reportId === report.id ? copyResult.copied : undefined;
  async function copySummary() {
    const success = await setStringAsync(report.summary).catch(() => false);
    setCopyResult({ reportId: report.id, copied: success });
    AccessibilityInfo.announceForAccessibility(
      success ? copy.reportSummaryCopied : copy.reportSummaryCopyFailed,
    );
  }
  return (
    <Panel>
      <SectionHeading
        title={copy.report}
        detail={`${copy.submitted} ${new Date(report.submittedAt).toLocaleString(dateLocale)}`}
      />
      {report.answers.map((answer) => (
        <View key={answer.itemId} style={styles.checkItem}>
          <Copy variant="label">{reportItemLabel(template, answer.itemId)}</Copy>
          <Copy style={answer.value === 'fail' ? { color: colors.amber } : undefined}>
            {answer.value === 'text' || answer.value === 'number'
              ? answerLabel(answer)
              : copy.results[answer.value]}
          </Copy>
          {answer.note ? <Copy muted>{answer.note}</Copy> : null}
        </View>
      ))}
      <View style={styles.summaryHeading}>
        <SectionHeading title={copy.reportSummary} />
        {report.summary.trim().length > 0 && (
          <Button
            title={copied ? copy.reportSummaryCopied : copy.copyReportSummary}
            accessibilityLabel={copy.copyReportSummary}
            icon={copied ? Check : CopyIcon}
            iconOnly
            variant="ghost"
            onPress={() => void copySummary()}
          />
        )}
      </View>
      <Copy testID="saved-report-summary">{report.summary}</Copy>
      {copied === false && <Copy muted>{copy.reportSummaryCopyFailed}</Copy>}
      {report.photos.map((photo) => (
        <View key={photo.id}>
          <Image
            accessibilityLabel={copy.submittedPhoto}
            source={{
              uri: `${baseUrl}/api/v1/photos/${photo.id}`,
              headers: { Authorization: `Bearer ${token}` },
            }}
            style={styles.photo}
          />
          {photo.itemId && <Copy muted>{reportItemLabel(template, photo.itemId)}</Copy>}
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  summaryHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  checkItem: {
    paddingBottom: spacing.lg,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  photo: { width: '100%', height: size.photo, resizeMode: 'cover', borderRadius: radius.control },
});
