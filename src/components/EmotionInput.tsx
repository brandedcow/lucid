import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, spacing } from '../theme';
import { capitalizeFirst } from '../utils/capitalizeFirst';
import { addEmotions } from '../utils/emotions';

const MAX_SUGGESTIONS = 8;

type Props = {
  /** The emotions added so far (lowercase). */
  emotions: string[];
  onEmotionsChange: (emotions: string[]) => void;
  /** Text typed but not yet turned into an emotion. Owned by the parent so it can be saved too. */
  draft: string;
  onDraftChange: (draft: string) => void;
  /** Emotion words used before (lowercase), offered as one-tap options. */
  suggestions: string[];
  /** Locks the input while a save is in flight. */
  disabled?: boolean;
};

/**
 * Works like the tag input: type an emotion and press Enter to add it as a chip under the field;
 * tap a chip to remove it. Earlier emotion words show as "+ calm" chips. Chips are shown
 * capitalized; the stored word stays lowercase. A comma or semicolon also finishes an emotion.
 */
export function EmotionInput({
  emotions,
  onEmotionsChange,
  draft,
  onDraftChange,
  suggestions,
  disabled = false,
}: Props) {
  const commit = () => {
    onEmotionsChange(addEmotions(emotions, draft));
    onDraftChange('');
  };

  const prefix = draft.trim().toLowerCase();
  const known = [...new Set(suggestions.map((w) => w.trim().toLowerCase()).filter(Boolean))];
  const shown = known
    .filter((word) => !emotions.includes(word) && word.startsWith(prefix))
    .slice(0, MAX_SUGGESTIONS);

  return (
    <View style={styles.wrap}>
      <TextInput
        value={draft}
        onChangeText={(text) => {
          // A comma or semicolon finishes the emotion, so multi-word ones like "a bit uneasy" work.
          if (/[,;]/.test(text)) {
            onEmotionsChange(addEmotions(emotions, text));
            onDraftChange('');
          } else {
            onDraftChange(text);
          }
        }}
        onSubmitEditing={commit}
        editable={!disabled}
        placeholder="Add an emotion..."
        placeholderTextColor={colors.faint}
        accessibilityLabel="How did it feel?"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        blurOnSubmit={false}
        style={styles.input}
      />

      {emotions.length > 0 && (
        <View style={styles.row}>
          {emotions.map((emotion) => (
            <Pressable
              key={emotion}
              accessibilityRole="button"
              accessibilityLabel={`Remove emotion ${emotion}`}
              onPress={() => onEmotionsChange(emotions.filter((e) => e !== emotion))}
              style={[styles.chip, styles.chipSelected]}
            >
              <Text style={styles.chipSelectedLabel}>{capitalizeFirst(emotion)}</Text>
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          ))}
        </View>
      )}

      {shown.length > 0 && (
        <View style={styles.row}>
          {shown.map((word) => (
            <Pressable
              key={word}
              accessibilityRole="button"
              onPress={() => {
                onEmotionsChange(addEmotions(emotions, word));
                onDraftChange('');
              }}
              style={styles.chip}
            >
              <Text style={styles.chipLabel}>+ {word}</Text>
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
  chipSelected: { backgroundColor: colors.emotionChipBg, borderColor: colors.emotionChipBg },
  chipLabel: { color: colors.muted, fontSize: 14 },
  chipSelectedLabel: { color: colors.emotionChipText, fontSize: 14, fontWeight: '600' },
  remove: { color: colors.emotionChipText, fontSize: 11 },
  input: {
    color: colors.text,
    fontSize: 16,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
