import { describe, it, expect } from 'vitest';
import { tightenListSerialization } from './markdown-normalize';

describe('tightenListSerialization', () => {
  it('collapses a loose list back to tight (2.1)', () => {
    const loose = ['## Related', '', '* a', '', '* b', '', '* c', ''].join('\n');
    const tight = ['## Related', '', '* a', '* b', '* c', ''].join('\n');
    expect(tightenListSerialization(loose)).toBe(tight);
  });

  it('tightens dash-marker lists (marker-agnostic)', () => {
    const loose = ['- a', '', '- b', '', '- c'].join('\n');
    const tight = ['- a', '- b', '- c'].join('\n');
    expect(tightenListSerialization(loose)).toBe(tight);
  });

  it('collapses ordered lists and nested items too', () => {
    const loose = ['1. one', '', '2. two', '', '  * nested a', '', '  * nested b'].join('\n');
    const tight = ['1. one', '2. two', '  * nested a', '  * nested b'].join('\n');
    expect(tightenListSerialization(loose)).toBe(tight);
  });

  it('preserves blank lines between multi-paragraph list items (2.2)', () => {
    const md = ['* first item', '', '  second paragraph of first item', '', '* second item'].join('\n');
    // The blank line before an indented continuation must stay; the blank line
    // before "* second item" is preceded by a continuation paragraph (not a
    // list marker), so it is preserved too.
    expect(tightenListSerialization(md)).toBe(md);
  });

  it('leaves fenced code block content untouched (2.3)', () => {
    const md = ['```md', '* a', '', '* b', '', '```', '', '* real a', '', '* real b'].join('\n');
    const expected = ['```md', '* a', '', '* b', '', '```', '', '* real a', '* real b'].join('\n');
    expect(tightenListSerialization(md)).toBe(expected);
  });

  it('does not merge a list into the following block', () => {
    const md = ['* a', '', '* b', '', 'A trailing paragraph.'].join('\n');
    const expected = ['* a', '* b', '', 'A trailing paragraph.'].join('\n');
    expect(tightenListSerialization(md)).toBe(expected);
  });

  it('is idempotent on a realistic note with headings and lists (2.4)', () => {
    const note = [
      '# Title',
      '',
      '## Related',
      '',
      '* [[wiki/concepts/a.md]]',
      '',
      '* [[wiki/concepts/b.md]]',
      '',
      '## Open Questions',
      '',
      '* Question one?',
      '',
      '* Question two?',
      '',
    ].join('\n');
    const once = tightenListSerialization(note);
    const twice = tightenListSerialization(once);
    expect(twice).toBe(once);
    // Headings keep their surrounding blank lines; list items are tightened.
    expect(once).toContain('* [[wiki/concepts/a.md]]\n* [[wiki/concepts/b.md]]');
    expect(once).toContain('## Related\n\n* [[wiki/concepts/a.md]]');
  });
});
