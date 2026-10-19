// Test suite for timeFormat utilities including 12-hour AM/PM and 24-hour parsing

import assert from 'node:assert';
import {
  parseAnyTimeToHHMM,
  formatTo12Hour,
  calculateDurationMinutes,
  isValid24HourTime,
} from './src/utils/timeFormat.js';

console.log('--- RUNNING TIME PARSING & FORMATTING TEST SUITE ---');

// Test 1: parseAnyTimeToHHMM with 12-hour format
console.log('\n[Test 1] 12-hour AM/PM Parsing');
assert.strictEqual(parseAnyTimeToHHMM('12:19 pm'), '12:19', '12:19 pm should parse to 12:19');
assert.strictEqual(parseAnyTimeToHHMM('12:19 PM'), '12:19', '12:19 PM should parse to 12:19');
assert.strictEqual(parseAnyTimeToHHMM('12:19 am'), '00:19', '12:19 am should parse to 00:19');
assert.strictEqual(parseAnyTimeToHHMM('9:30 AM'), '09:30', '9:30 AM should parse to 09:30');
assert.strictEqual(parseAnyTimeToHHMM('9:30 pm'), '21:30', '9:30 pm should parse to 21:30');
assert.strictEqual(parseAnyTimeToHHMM('1:45 PM'), '13:45', '1:45 PM should parse to 13:45');
console.log('✓ Test 1 Passed: 12-hour AM/PM properly converted to HH:mm');

// Test 2: parseAnyTimeToHHMM with 24-hour format
console.log('\n[Test 2] 24-hour Standard Parsing');
assert.strictEqual(parseAnyTimeToHHMM('21:30'), '21:30', '21:30 should stay 21:30');
assert.strictEqual(parseAnyTimeToHHMM('12:19'), '12:19', '12:19 should stay 12:19');
assert.strictEqual(parseAnyTimeToHHMM('00:00'), '00:00', '00:00 should stay 00:00');
assert.strictEqual(parseAnyTimeToHHMM('09:15'), '09:15', '09:15 should stay 09:15');
console.log('✓ Test 2 Passed: 24-hour strings properly validated and normalized');

// Test 3: Invalid inputs
console.log('\n[Test 3] Invalid input handling');
assert.strictEqual(parseAnyTimeToHHMM('invalid'), null, 'Random string should return null');
assert.strictEqual(parseAnyTimeToHHMM('25:00'), null, 'Hour 25 should return null');
assert.strictEqual(parseAnyTimeToHHMM('12:65 pm'), null, 'Minute 65 should return null');
assert.strictEqual(parseAnyTimeToHHMM(''), null, 'Empty string should return null');
assert.strictEqual(parseAnyTimeToHHMM(null), null, 'null should return null');
console.log('✓ Test 3 Passed: Invalid formats safely rejected with null');

// Test 4: Duration calculation with midnight crossing
console.log('\n[Test 4] Duration calculation & midnight crossing');
assert.strictEqual(calculateDurationMinutes('21:00', '21:30'), 30);
assert.strictEqual(calculateDurationMinutes('23:45', '00:15'), 30, 'Midnight crossing should yield 30 minutes');
assert.strictEqual(calculateDurationMinutes('22:00', '22:00'), 0);
console.log('✓ Test 4 Passed: Duration calculation handles regular and midnight crossing');

// Test 5: 12-hour display formatting
console.log('\n[Test 5] 12-hour display formatting');
assert.strictEqual(formatTo12Hour('21:30'), '9:30 PM');
assert.strictEqual(formatTo12Hour('12:19'), '12:19 PM');
assert.strictEqual(formatTo12Hour('00:19'), '12:19 AM');
assert.strictEqual(formatTo12Hour('21:30-21:45'), '9:30–9:45 PM');
console.log('✓ Test 5 Passed: 12-hour display labels formatted for citizens');

console.log('\n--- ALL TIME PARSING & FORMATTING TESTS PASSED! ---');
