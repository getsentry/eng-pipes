// eslint-disable-next-line
module.exports = {
  collectCoverageFrom: [
    '**/*.ts',
    '!test/**',
    '!migrations/**',
    '!src/types/**',
  ],
  testEnvironment: 'node',
  testRunner: 'jest-circus/runner',
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testRegex: '(/__tests__/.*|\\.(test|spec))\\.[tj]sx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  modulePathIgnorePatterns: ['<rootDir>/.*/__mocks__'],

  globalSetup: './test/jest.globalSetup.ts',
  globalTeardown: './test/jest.globalTeardown.ts',
  setupFilesAfterEnv: ['./test/jest.setup.ts'],

  globals: {
    'ts-jest': {
      isolatedModules: true,
      tsconfig: './test/jest.tsconfig.json',
    },
  },
};
