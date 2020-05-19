// eslint-disable-next-line
module.exports = {
  testEnvironment: 'node',
  testRunner: 'jest-circus/runner',
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testRegex: '(/__tests__/.*|\\.(test|spec))\\.[tj]sx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@test/(.*)$': '<rootDir>/test/$1',
  },
};
