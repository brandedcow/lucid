import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, spacing } from '../theme';
import { addTag, normalizeTag } from '../utils/tags';

const MAX_SUGGESTIONS = 8;

type Props = {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  /** Text typed but not yet turned into a tag. Owned by the parent so it can be saved too. */
  draft: string;
  onDraftChange: (draft: string) => void;
  /** Tags already used elsewhere, offered as one-tap options. */
  suggestions: string[];
};

export function TagInput({ tags, onTagsChange, draft, onDraftChange, suggestions }: Props) {
  const commit = () => {
    onTagsChange(addTag(tags, draft));
    onDraftChange('');
  };

  const prefix = normalizeTag(draft);
  const shown = suggestions
    .filter((tag) => !tags.includes(tag) && tag.startsWith(prefix))
    .slice(0, MAX_SUGGESTIONS);

  return (
    <View style={styles.wrap}>
      {tags.length > 0 && (
        <View style={styles.row}>
          {tags.map((tag) => (
            <Pressable
              key={tag}
              accessibilityRole="button"
              accessibilityLabel={`Remove tag ${tag}`}
              onPress={() => onTagsChange(tags.filter((t) => t !== tag))}
              style={[styles.chip, styles.chipSelected]}
            >
              <Text style={styles.chipSelectedLabel}>{tag}</Text>
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          ))}
        </View>
      )}

      <TextInput
        value={draft}
        onChangeText={(text) => {
          // A comma finishes the tag, so multi-word tags like "flying home" still work.
          if (text.endsWith(',')) {
            onTagsChange(addTag(tags, text.slice(0, -1)));
            onDraftChange('');
          } else {
            onDraftChange(text);
          }
        }}
        onSubmitEditing={commit}
        placeholder="Add a tag"
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        style={styles.input}
      />

      {shown.length > 0 && (
        <View style={styles.row}>
          {shown.map((tag) => (
            <Pressable
              key={tag}
              accessibilityRole="button"
              onPress={() => {
                onTagsChange(addTag(tags, tag));
                onDraftChange('');
              }}
              style={styles.chip}
            >
              <Text style={styles.chipLabel}>{tag}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.muted, fontSize: 14 },
  chipSelectedLabel: { color: colors.accentDark, fontSize: 14, fontWeight: '600' },
  remove: { color: colors.accentDark, fontSize: 11 },
  input: {
    color: colors.text,
    fontSize: 16,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
