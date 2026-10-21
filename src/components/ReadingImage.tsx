import { useState } from 'react';
import {
  Image,
  Pressable,
  Text,
  type ImageLoadEventData,
  type NativeSyntheticEvent,
} from 'react-native';
import { imageUrlStatus, safeImageUrl } from '../utils/safeUrl';
import { readingStyles as s } from './readingStyles';

type Props = {
  alt: string;
  url: string;
  imagesEnabled: boolean;
  linksDisabled: boolean;
  onEdit: () => void;
};

function Placeholder({
  alt,
  note,
  onPress,
  role,
  hint,
  disabled,
}: {
  alt: string;
  note: string;
  onPress: () => void;
  role?: 'button';
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityHint={hint}
      style={s.imagePlaceholder}
    >
      <Text style={s.imageAlt}>{alt === '' ? 'Image' : alt}</Text>
      <Text style={s.imageNote}>{note}</Text>
    </Pressable>
  );
}

/**
 * An own-line image. Only https URLs are ever loaded, and only when the setting allows it or the
 * reader taps to load this one. No cache option and no headers: the plain `uri` source.
 */
export function ReadingImage({ alt, url, imagesEnabled, linksDisabled, onEdit }: Props) {
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [ratio, setRatio] = useState<number | null>(null);
  const status = imageUrlStatus(url);
  const label = alt === '' ? 'Image' : alt;

  const safe = safeImageUrl(url);

  if (status === 'needs-https') {
    return <Placeholder alt={alt} note="This image needs https" onPress={onEdit} />;
  }
  if (status === 'invalid' || safe === null) {
    return <Placeholder alt={alt} note="Can't show this image" onPress={onEdit} />;
  }
  if (!imagesEnabled && !requested) {
    return (
      <Placeholder
        alt={alt}
        note="Tap to load"
        role="button"
        disabled={linksDisabled}
        onPress={() => setRequested(true)}
      />
    );
  }
  if (failed) {
    return (
      <Placeholder
        alt={alt}
        note="Couldn't load this image. Tap to try again."
        role="button"
        disabled={linksDisabled}
        onPress={() => {
          setFailed(false);
          setRatio(null);
          setRetryKey((k) => k + 1);
        }}
      />
    );
  }

  const onLoad = (e: NativeSyntheticEvent<ImageLoadEventData>) => {
    const src = e?.nativeEvent?.source;
    const w = src?.width;
    const h = src?.height;
    if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0 && isFinite(w / h)) {
      setRatio(w / h);
    }
  };

  return (
    <Pressable onPress={onEdit} style={s.imageBox}>
      <Image
        key={retryKey}
        testID="reading-image"
        source={{ uri: safe }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel={label}
        onLoad={onLoad}
        onError={() => setFailed(true)}
        style={ratio === null ? s.imageFixed : [s.imageSized, { aspectRatio: ratio }]}
      />
    </Pressable>
  );
}
