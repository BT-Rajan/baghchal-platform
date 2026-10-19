import { StyleSheet, Text, View } from 'react-native';

import type { LegalDocumentName } from '@/api/endpoints';
import { useLegalDocument } from '@/legal/hooks';
import { parse, type Span } from '@/legal/markdown';
import { colors, spacing, type } from '@/theme';

import { Screen } from './Screen';
import { ErrorState, Loading } from './States';

/** The terms or the privacy policy, as the server has them, drawn from their Markdown. */
export function LegalDocument({ document }: { document: LegalDocumentName }) {
  const query = useLegalDocument(document);
  if (query.isPending) {
    return (
      <Screen align="top">
        <Loading />
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
  return (
    <Screen align="top">
      {parse(query.data.text).map((block, i) => {
        switch (block.kind) {
          case 'title':
            return (
              <Text key={i} role="heading" style={styles.title}>
                {block.text}
              </Text>
            );
          case 'heading':
            return (
              <Text key={i} role="heading" style={styles.heading}>
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
      })}
      <Text style={styles.version}>{`Version of ${query.data.version}`}</Text>
    </Screen>
  );
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
  heading: { ...type.heading, color: colors.text, marginTop: spacing.sm },
  body: { ...type.body, color: colors.text },
  bold: { fontWeight: '700' },
  list: { gap: spacing.xs },
  version: { ...type.caption, color: colors.muted },
});
