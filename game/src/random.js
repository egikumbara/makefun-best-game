// Small seeded PRNG (mulberry32) so a ?seed=N run is perfectly repeatable:
// the same seed always spawns the same enemies in the same places, which is
// what makes the screenshot scenes deterministic.

export function createRandom(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    // Integer in [min, max).
    int(min, max) {
      return min + Math.floor(this.next() * (max - min));
    },
    // Float in [min, max).
    range(min, max) {
      return min + this.next() * (max - min);
    },
    // Pick one entry from a weighted [[value, weight], ...] list.
    weighted(entries) {
      let total = 0;
      for (const [, weight] of entries) total += weight;
      let roll = this.next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
  };
}
