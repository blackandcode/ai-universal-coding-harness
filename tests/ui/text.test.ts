/**
 * @fileoverview Unit tests for text formatting and layout utilities in src/ui/text.ts.
 *
 * Validates text normalization, bounded truncation, word wrapping across column boundaries,
 * phase and tool status glyph resolution, color mapping, and progress bar calculation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOneLine,
  truncateText,
  wrapText,
  getPhaseIcon,
  getPhaseColor,
  getToolStatusIcon,
  getToolStatusColor,
  formatProgressBar
} from '../../src/ui/text.js';

test('normalizeOneLine: collapses whitespace and trims', () => {
  assert.equal(normalizeOneLine('  hello   world  \n\t foo '), 'hello world foo');
  assert.equal(normalizeOneLine(''), '');
});

test('truncateText: preserves short strings and adds ellipsis to long strings', () => {
  assert.equal(truncateText('short', 10), 'short');
  assert.equal(truncateText('hello world extra long', 10), 'hello wor…');
  assert.equal(truncateText('', 10), '');
});

test('wrapText: wraps lines and handles empty lines and long words', () => {
  const wrapped = wrapText(
    'line 1\n\nvery long text that definitely needs to wrap across multiple lines in column',
    20
  );
  assert.ok(wrapped.length > 2);
  assert.equal(wrapped[1], ''); // Preserves empty line

  // Unbreakable word
  const hardBreak = wrapText('supercalifragilisticexpialidocious', 10);
  assert.ok(hardBreak.length > 1);
});

test('getPhaseIcon and getPhaseColor: map statuses accurately', () => {
  assert.equal(getPhaseIcon('completed'), '✓');
  assert.equal(getPhaseIcon('failed'), '✗');
  assert.equal(getPhaseIcon('in_progress'), '◐');
  assert.equal(getPhaseIcon('unknown'), '○');

  assert.equal(getPhaseColor('completed'), 'green');
  assert.equal(getPhaseColor('failed'), 'red');
  assert.equal(getPhaseColor('in_progress'), 'cyan');
  assert.equal(getPhaseColor('unknown'), 'gray');
});

test('getToolStatusIcon and getToolStatusColor: map tool states', () => {
  assert.equal(getToolStatusIcon('in_progress'), '◐');
  assert.equal(getToolStatusIcon('completed'), '✓');
  assert.equal(getToolStatusIcon('failed'), '✗');

  assert.equal(getToolStatusColor('failed'), 'red');
  assert.equal(getToolStatusColor('in_progress'), 'cyan');
  assert.equal(getToolStatusColor('completed'), 'green');
  assert.equal(getToolStatusColor('unknown'), 'gray');
});

test('formatProgressBar: calculates filled, unfilled, and percentage accurately', () => {
  const bar0 = formatProgressBar(0, 40);
  assert.equal(bar0.percent, '0%');
  assert.ok(bar0.unfilled.length > 0);

  const bar50 = formatProgressBar(0.5, 40);
  assert.equal(bar50.percent, '50%');
  assert.equal(bar50.filled.length, bar50.unfilled.length);

  const bar100 = formatProgressBar(1.0, 40);
  assert.equal(bar100.percent, '100%');
  assert.equal(bar100.unfilled.length, 0);
});
