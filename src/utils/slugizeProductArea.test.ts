import { slugizeProductArea } from './slugizeProductArea';

describe('slugizeProductArea', function () {
  describe('slugize tests', function () {
    it('behaves as expected', async function () {
      const cases = [
        ['MOST of ALL', 'most-of-all'],
        ['Cheese & Bread', 'cheese-bread'],
        ['otherwise - notherwise', 'otherwise-notherwise'],
        ['over - & - yonder', 'over-yonder'],
        ["other's druthers", 'others-druthers'],
      ];
      cases.forEach((x) => {
        expect(slugizeProductArea(x[0])).toEqual(x[1]);
      });
      expect(() => {
        slugizeProductArea('other^s druthers');
      }).toThrow('Bad slug: other^s-druthers');
    });
  });
});
