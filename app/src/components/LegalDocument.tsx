import { Platform, StyleSheet, Text, View } from 'react-native';

import type { LegalDocumentName } from '@/api/endpoints';
import { useLegalDocument } from '@/legal/hooks';
import { t } from '@/i18n';
import { dayText } from '@/lobby/format';
import { parse, sections, type Body, type Span } from '@/legal/markdown';
import { colors, spacing, type } from '@/theme';

import { Disclosure } from './Disclosure';
import { Screen } from './Screen';
import { ErrorState, Loading } from './States';

/** The terms or the privacy policy, as the server has them, drawn from their Markdown. */
export function LegalDocument({ document }: { document: LegalDocumentName }) {
  const query = useLegalDocument(document);
  if (query.isPending) {
    return (
      <Screen align="top">
        <Loading
          label={document === 'terms' ? t('Loading the terms') : t('Loading the privacy policy')}
        />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen align="top">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }
  const { intro, sections: parts } = sections(parse(query.data.text));
  // In the apps the header bar already names the document: its own title is not repeated.
  const shown = Platform.OS === 'web' ? intro : intro.filter((block) => block.kind !== 'title');
  return (
    <Screen align="top">
      <Blocks blocks={shown} />
      {/* Each section shut until asked for: the headings are the contents. */}
      <View>
        {parts.map((part) => (
          <Disclosure key={part.heading} title={part.heading}>
            <Blocks blocks={part.blocks} />
          </Disclosure>
        ))}
      </View>
      <Text style={styles.version}>
        {t('Updated {date}', { date: versionDate(query.data.version) })}
      </Text>
    </Screen>
  );
}

/** A version is the date it took effect ("2026-10-21"), shown as a date ("21 Oct 2026"). */
function versionDate(version: string): string {
  // Midday, so the day is the same in every time zone.
  return /^\d{4}-\d{2}-\d{2}$/.test(version) ? dayText(`${version}T12:00:00`) : version;
}

function Blocks({ blocks }: { blocks: Body[] }) {
  return blocks.map((block, i) => {
    switch (block.kind) {
      case 'title':
        return (
          <Text key={i} role="heading" style={styles.title}>
            {block.text}
          </Text>
        );
      case 'paragraph':
        return (
          <Text key={i} style={styles.body}>
            <Spans spans={block.spans} />
          </Text>
        );
      case 'list':
        return (
          <View key={i} role="list" style={styles.list}>
            {block.items.map((item, j) => (
              <Text key={j} role="listitem" style={styles.body}>
                {'•  '}
                <Spans spans={item} />
              </Text>
            ))}
          </View>
        );
    }
  });
}

function Spans({ spans }: { spans: Span[] }) {
  return spans.map((span, i) => (
    <Text key={i} style={span.bold && styles.bold}>
      {span.text}
    </Text>
  ));
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  body: { ...type.body, color: colors.text },
  bold: { fontWeight: '700' },
  list: { gap: spacing.xs },
  version: { ...type.caption, color: colors.muted },
});
