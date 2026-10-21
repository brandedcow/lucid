import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ReadingImage } from './ReadingImage';

const URL = 'https://e.test/i.png';

function el(over: Partial<React.ComponentProps<typeof ReadingImage>> = {}) {
  return (
    <ReadingImage
      alt="pic"
      url={URL}
      imagesEnabled={false}
      linksDisabled={false}
      onEdit={() => {}}
      {...over}
    />
  );
}

describe('ReadingImage', () => {
  it('invalid URL: placeholder, no Image', async () => {
    await render(el({ url: 'javascript:alert(1)' }));
    expect(screen.getByText("Can't show this image")).toBeTruthy();
    expect(screen.queryByTestId('reading-image', { hidden: true })).toBeNull();
  });

  it('http URL: needs https, no Image, even when images are on', async () => {
    await render(el({ url: 'http://e.test/i.png', imagesEnabled: true }));
    expect(screen.getByText('This image needs https')).toBeTruthy();
    expect(screen.queryByTestId('reading-image', { hidden: true })).toBeNull();
  });

  it('empty alt shows Image', async () => {
    await render(el({ alt: '', url: 'nope' }));
    expect(screen.getByText('Image')).toBeTruthy();
  });

  it('setting off: no Image until tapped, then the exact safe URL, no cache or headers', async () => {
    await render(el({ url: `  ${URL}  ` }));
    expect(screen.queryByTestId('reading-image', { hidden: true })).toBeNull();
    await fireEvent.press(screen.getByRole('button'));
    const img = screen.getByTestId('reading-image', { hidden: true });
    expect(img.props.source).toEqual({ uri: URL });
    expect(screen.getByLabelText('pic')).toBeTruthy();
  });

  it('setting on: loads immediately', async () => {
    await render(el({ imagesEnabled: true }));
    expect(screen.getByTestId('reading-image', { hidden: true }).props.source).toEqual({
      uri: URL,
    });
  });

  it('sizes from onLoad via aspectRatio and falls back for bad sizes', async () => {
    await render(el({ imagesEnabled: true }));
    const flat = () =>
      StyleSheet.flatten(screen.getByTestId('reading-image', { hidden: true }).props.style);
    expect(flat().height).toBe(200);
    await fireEvent(screen.getByTestId('reading-image', { hidden: true }), 'load', {
      nativeEvent: { source: { width: 0, height: 10 } },
    });
    expect(flat().height).toBe(200);
    await fireEvent(screen.getByTestId('reading-image', { hidden: true }), 'load', {
      nativeEvent: { source: { width: 400, height: 200 } },
    });
    expect(flat().aspectRatio).toBe(2);
    expect(flat().width).toBe('100%');
    expect(screen.getByTestId('reading-image', { hidden: true }).props.resizeMode).toBe('contain');
  });

  it('missing load event data falls back to the fixed height', async () => {
    await render(el({ imagesEnabled: true }));
    await fireEvent(screen.getByTestId('reading-image', { hidden: true }), 'load', {});
    expect(
      StyleSheet.flatten(screen.getByTestId('reading-image', { hidden: true }).props.style).height,
    ).toBe(200);
  });

  it('error shows the failure placeholder; a press retries with a new Image', async () => {
    await render(el({ imagesEnabled: true }));
    await fireEvent(screen.getByTestId('reading-image', { hidden: true }), 'error', {});
    expect(screen.queryByTestId('reading-image', { hidden: true })).toBeNull();
    await fireEvent.press(screen.getByText("Couldn't load this image. Tap to try again."));
    expect(screen.getByTestId('reading-image', { hidden: true })).toBeTruthy();
  });

  it('linksDisabled: tap to load is inert', async () => {
    await render(el({ linksDisabled: true }));
    await fireEvent.press(screen.getByRole('button'));
    expect(screen.queryByTestId('reading-image', { hidden: true })).toBeNull();
  });

  it('pressing a loaded image edits', async () => {
    const onEdit = jest.fn();
    await render(el({ imagesEnabled: true, onEdit }));
    await act(async () => {});
    await fireEvent.press(screen.getByTestId('reading-image', { hidden: true }));
    expect(onEdit).toHaveBeenCalled();
  });
});
