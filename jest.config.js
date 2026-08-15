module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx', '**/*.test.js'],
  // Use ts-jest for .ts files, babel-jest for jsx/tsx, no transform needed for plain .js
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // Mock non-code imports
  moduleNameMapper: {
    '\\.(png|jpg|jpeg|gif|svg|pdf|txt)$': '<rootDir>/__mocks__/fileMock.js',
  },
};
