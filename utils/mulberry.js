/**
 * Creates a seeded 32-bit Mulberry pseudorandom number generator.
 * @param {number} seed - The initial seed value.
 * @returns {function(): number} A function that generates a pseudorandom number between 0 (inclusive) and 1 (exclusive).
 */
export default function mulberry32(seed) {
  let state = seed;
  return function () {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
