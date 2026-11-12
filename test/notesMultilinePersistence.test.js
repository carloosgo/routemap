import test from 'node:test';
import assert from 'node:assert/strict';
import { v4EntityPayload } from '../src/infrastructure/firebase/v4EntityDocuments.js';

test('general notes keep line breaks when saved to Firestore', () => {
  const payload = v4EntityPayload('note', { id: 'n1', title: 'Pendientes', text: 'Día 1\n\n- Louvre\r\n- Torre Eiffel' }, '0000000001');
  assert.equal(payload.text, 'Día 1\n\n- Louvre\n- Torre Eiffel');
});
