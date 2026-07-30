import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCollapsedSegments,
  isOutsideTarget,
  isSaveShortcut,
} from '../src/app/appInteractionModel.js';

test('isSaveShortcut reconoce Ctrl+S y Cmd+S sin importar mayúsculas', () => {
  assert.equal(isSaveShortcut({ ctrlKey: true, metaKey: false, key: 's' }), true);
  assert.equal(isSaveShortcut({ ctrlKey: false, metaKey: true, key: 'S' }), true);
  assert.equal(isSaveShortcut({ ctrlKey: false, metaKey: false, key: 's' }), false);
  assert.equal(isSaveShortcut({ ctrlKey: true, metaKey: false, key: 'p' }), false);
});

test('createCollapsedSegments genera estado colapsado solo para IDs válidos', () => {
  assert.deepEqual(
    createCollapsedSegments([{ id: 'a' }, { id: 'b' }, null, {}]),
    { a: false, b: false }
  );
  assert.deepEqual(createCollapsedSegments(), {});
});

test('isOutsideTarget distingue objetivos internos y externos', () => {
  const inside = {};
  const outside = {};
  const container = {
    contains(target) {
      return target === inside;
    },
  };

  assert.equal(isOutsideTarget(container, inside), false);
  assert.equal(isOutsideTarget(container, outside), true);
  assert.equal(isOutsideTarget(null, outside), false);
});
