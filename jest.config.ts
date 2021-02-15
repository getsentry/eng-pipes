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
  modulePathIgnorePatterns: ['<rootDir>/.*/__mocks__'],

  // TODO: Use `ts-jest` and map from tsconfig
  // See https://kulshekhar.github.io/ts-jest/user/config/#jest-config-with-helper
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/src/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
    '^@types$': '<rootDir>/src/types',
  },

  globalSetup: './test/jest.globalSetup.ts',
  globalTeardown: './test/jest.globalTeardown.ts',
  setupFilesAfterEnv: ['./test/jest.setup.ts'],
};
