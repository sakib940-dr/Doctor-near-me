import { IMAGE_MAX_SIZE_ERROR, validateSelectedImage } from '../src/lib/imageOptimization.ts';

const cases = [
  { label: '500 KB', bytes: 500 * 1024, accepted: true },
  { label: '2 MB', bytes: 2 * 1024 * 1024, accepted: true },
  { label: '5 MB', bytes: 5 * 1024 * 1024, accepted: true },
  { label: '5.1 MB', bytes: Math.round(5.1 * 1024 * 1024), accepted: false },
];

for (const test of cases) {
  const file = new File([new Uint8Array(test.bytes)], `${test.label}.jpg`, { type: 'image/jpeg' });
  let accepted = true;
  let message = '';
  try { validateSelectedImage(file); } catch (error) { accepted = false; message = error instanceof Error ? error.message : String(error); }
  if (accepted !== test.accepted) throw new Error(`${test.label}: expected accepted=${test.accepted}, got ${accepted}`);
  if (!accepted && message !== IMAGE_MAX_SIZE_ERROR) throw new Error(`${test.label}: wrong error: ${message}`);
  console.log(`${test.label}: ${accepted ? 'ACCEPT' : `REJECT (${message})`}`);
}
console.log('Image size gate tests PASS');
