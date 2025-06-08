module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.test.js', '**/?(*.)+(spec|test).ts', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.js',
    '!src/**/*.test.ts',
    '!src/**/*.test.js',
    '!src/**/*.d.ts',
    '!**/node_modules/**'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'babel-jest'
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
