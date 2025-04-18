// eslint-disable-next-line
module.exports = {
  // TODO: Remove the snapshotFormat override below and regen snapshots
  //       This is a remnant from the v29 upgrade
  snapshotFormat: {
    escapeString: true,
    printBasicPrototype: true,
  },
  collectCoverageFrom: [
    '**/*.ts',
    '!test/**',
    '!migrations/**',
    '!src/types/**',
  ],
  coverageReporters: ['clover', 'json', 'lcov', 'text', 'html'],
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
  // ⚠️  Keep this in sync with package.json and tsconfig.json. ⚠️
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
    '^@types$': '<rootDir>/src/types',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@webhooks$': '<rootDir>/src/webhooks',
    '^@webhooks/(.*)$': '<rootDir>/src/webhooks/$1',
  },

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
