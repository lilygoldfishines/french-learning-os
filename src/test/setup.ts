import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { FlosDB, useDatabase } from '../db/db';

let n = 0;
beforeEach(() => {
  useDatabase(new FlosDB(`test-${++n}`));
});
