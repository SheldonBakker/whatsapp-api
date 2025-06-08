const request = require('supertest');
const app = require('../src/app');

describe('API Health Check', () => {
  test('GET /ping should return 200', async () => {
    const response = await request(app)
      .get('/ping')
      .expect(200);
    
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message');
  });

  test('GET /health should require API key', async () => {
    const response = await request(app)
      .get('/health')
      .expect(403);
    
    expect(response.body).toHaveProperty('success', false);
  });
});

describe('Configuration', () => {
  test('Config module should load without errors', () => {
    const config = require('../src/config');
    expect(config).toBeDefined();
    expect(config).toHaveProperty('sessionFolderPath');
    expect(config).toHaveProperty('globalApiKey');
  });
});

describe('Utilities', () => {
  test('ensureDirectories utility should work', () => {
    const { ensureDirectories } = require('../src/utils/ensureDirectories');
    expect(() => ensureDirectories()).not.toThrow();
  });
});
