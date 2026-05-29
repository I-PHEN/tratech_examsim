// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RichText } from './RichText';

describe('RichText image rendering', () => {
  it('renders a pill fallback (no <img>) for an unresolved OCR placeholder', () => {
    const { container } = render(<RichText>{'![diagram](img-0.jpeg)'}</RichText>);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('diagram');
  });

  it('renders an <img> with an http(s) src', () => {
    const url = 'https://example.com/foo.png';
    const { container } = render(<RichText>{`![alt](${url})`}</RichText>);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(url);
  });

  it('renders an <img> with a data URL src', () => {
    const data = 'data:image/png;base64,AAAA';
    const { container } = render(<RichText>{`![alt](${data})`}</RichText>);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(data);
  });
});
