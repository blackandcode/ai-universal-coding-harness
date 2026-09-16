/**
 * @fileoverview Smoke tests for TSX compilation and React JSX runtime execution via node:test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

interface SmokeProps {
  label: string;
}

function SmokeComponent({ label }: SmokeProps): React.JSX.Element {
  return React.createElement('span', null, label);
}

test('TSX smoke test compiles with react-jsx and executes via node:test', () => {
  const element = <SmokeComponent label="stage-01-tsx-smoke" />;
  assert.equal(element.type, SmokeComponent);
  assert.equal(element.props.label, 'stage-01-tsx-smoke');

  const rendered = SmokeComponent({ label: 'stage-01-direct' });
  assert.equal(rendered.type, 'span');
  assert.equal(rendered.props.children, 'stage-01-direct');
});
