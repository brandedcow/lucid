import { Pressable, StyleSheet } from 'react-native';
import { SearchIcon } from './SearchIcon';

export const SEARCH_BUTTON_LABEL = 'Search notes';

/** The magnifier button for the note list header. 44pt, named for screen readers. */
export function SearchButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={SEARCH_BUTTON_LABEL}
      onPress={onPress}
      style={styles.button}
    >
      <SearchIcon />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
