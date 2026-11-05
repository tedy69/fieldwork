import { Image, StyleSheet, View } from 'react-native';
import { answerLabel, reportItemLabel, type WorkOrder } from '@fieldwork/contracts';
import { inspectionCopy, type Locale } from '@fieldwork/strings';
import { Copy, Panel, SectionHeading } from './notebook-ui';
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
  const dateLocale = locale === 'id' ? 'id-ID' : undefined;
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
      <SectionHeading title={copy.reportSummary} />
      <Copy>{report.summary}</Copy>
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
  checkItem: {
    paddingBottom: spacing.lg,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  photo: { width: '100%', height: size.photo, resizeMode: 'cover', borderRadius: radius.control },
});
