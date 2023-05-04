import { slugizeProductArea } from './slugizeProductArea';

describe('slugizeProductArea', function () {
  describe('slugize tests', function () {
    it.each([
      ['MOST of ALL', 'most-of-all'],
      ['Cheese & Bread', 'cheese-bread'],
      ['otherwise - notherwise', 'otherwise-notherwise'],
      ['over - & - yonder', 'over-yonder'],
      ["other's druthers", 'other-s-druthers'],
    ])("converts '%s' to '%s'", (input, output) => {
      expect(slugizeProductArea(input)).toEqual(output);
    });
    it('handles errors', () => {
      expect(() => {
        slugizeProductArea('other^s druthers');
      }).toThrow('Bad slug: other^s-druthers');
    });
  });
});
