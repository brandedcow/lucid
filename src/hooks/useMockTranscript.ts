import { useCallback, useEffect, useState } from 'react';

const SAMPLE_LINES = [
  'I was back at my grandmother’s house, but the hallway kept going and going.',
  'There was water on the floor, maybe ankle deep, and it was warm.',
  'I couldn’t find the kitchen, and someone was calling my name from upstairs.',
];

// TODO: replace with live speech-to-text. Emits placeholder lines so the UI is demoable.
export function useMockTranscript(running: boolean) {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLines((prev) =>
        prev.length < SAMPLE_LINES.length ? [...prev, SAMPLE_LINES[prev.length]] : prev,
      );
    }, 2500);
    return () => clearInterval(id);
  }, [running]);

  const reset = useCallback(() => setLines([]), []);

  return { lines, reset };
}
