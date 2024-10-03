import { filterNulls } from './arrays';

describe('arrays', () => {
  describe('filterNulls', () => {
    it('should filter nulls', () => {
      const array = [1, 2, null, 3, null, 4];
      const result = filterNulls(array);
      expect(result).toEqual([1, 2, 3, 4]);
    });
    it('should no longer be typed as containing nulls', () => {
      const array = [1, 2, null, 3, null, 4];
      const result = filterNulls(array);
      const x: number = result[0];
      expect(x).toEqual(1);
    });
  });
});
