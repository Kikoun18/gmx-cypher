// After each test file, the folders it made in the system's temp folder are removed (test/helpers.ts).
import { afterAll } from 'vitest';
import { cleanTmp } from './helpers';

afterAll(cleanTmp);
