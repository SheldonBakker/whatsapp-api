# WhatsApp API Testing Suite

This directory contains comprehensive tests for the WhatsApp API, focusing on multi-session functionality, API documentation validation, and overall system reliability.

## Test Files

### 1. `api.test.js`
Basic API functionality tests including:
- Health check endpoints
- Configuration validation
- Utility functions

### 2. `multi-session.test.js`
Comprehensive multi-session functionality tests including:
- **Session Creation and Management**
  - Concurrent session creation
  - Independent session status tracking
  - Session listing and management
  - Session restart functionality

- **Session Isolation Tests**
  - Session ID validation
  - Non-existent session handling
  - API key authentication
  - Independent session operations

- **Client Operations with Multiple Sessions**
  - Independent client state retrieval
  - Request body validation
  - Cross-session operation isolation

- **Error Handling and Edge Cases**
  - Concurrent operations on same session
  - Graceful session termination
  - Resource cleanup

- **Performance and Resource Management**
  - Rapid session lifecycle testing
  - Memory and resource usage validation

### 3. `swagger-validation.test.js`
Swagger/OpenAPI documentation validation tests including:
- **Document Structure Validation**
  - OpenAPI 3.0.0 compliance
  - Required tags and components
  - Security scheme definitions

- **Path Validation**
  - Correct endpoint paths with proper prefixes
  - Parameter definitions
  - Request/response schemas

- **Endpoint Accessibility**
  - Live endpoint testing
  - Request format validation
  - Error response validation

- **Security Documentation**
  - API key requirement validation
  - Protected endpoint access control

### 4. `test-report.js`
Comprehensive test runner and report generator that:
- Runs all test suites
- Generates detailed reports
- Analyzes test results
- Provides recommendations
- Saves detailed JSON reports

## Running Tests

### Prerequisites
```bash
# Install dependencies
npm install

# Set up environment variables
export API_KEY="your-test-api-key"
export ENABLE_SWAGGER_ENDPOINT=true
```

### Individual Test Suites

```bash
# Run basic API tests
npm run test:api

# Run multi-session tests
npm run test:multi-session

# Run Swagger validation tests
npm run test:swagger

# Run all tests
npm run test:all
```

### Comprehensive Test Report

```bash
# Generate comprehensive test report
node tests/test-report.js
```

This will:
1. Build the project
2. Run all test suites
3. Generate a detailed console report
4. Save a JSON report to `tests/test-report.json`

## Test Configuration

### Environment Variables
- `API_KEY`: API key for authenticated requests (default: "test-api-key")
- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`: Skip Chromium download for faster testing
- `DISABLE_WEB_SECURITY`: Disable web security for testing

### Test Sessions
The multi-session tests use predefined session IDs:
- `test-session-1`
- `test-session-2` 
- `test-session-3`

These sessions are automatically cleaned up before and after tests.

## Key Test Scenarios

### Multi-Session Functionality
1. **Concurrent Session Creation**: Tests ability to create multiple WhatsApp sessions simultaneously
2. **Session Isolation**: Verifies that actions in one session don't affect others
3. **Independent State Management**: Ensures each session maintains its own state
4. **Resource Management**: Tests proper cleanup and resource usage
5. **Error Handling**: Validates graceful handling of errors and edge cases

### API Documentation Validation
1. **Path Accuracy**: Verifies all documented endpoints exist and are accessible
2. **Parameter Validation**: Tests that documented parameters match implementation
3. **Schema Compliance**: Validates request/response schemas
4. **Security Implementation**: Tests API key authentication
5. **Error Response Consistency**: Validates error responses match documentation

## Expected Test Results

### Successful Test Run
- All session creation tests should pass
- Session isolation should be maintained
- API endpoints should be accessible with correct parameters
- Swagger documentation should accurately reflect implementation
- Error handling should be graceful and consistent

### Common Issues and Solutions

#### Session Creation Failures
- **Issue**: Sessions fail to start
- **Solution**: Check Puppeteer configuration and Chrome availability

#### API Key Authentication Failures
- **Issue**: 403 Forbidden responses
- **Solution**: Verify API_KEY environment variable is set correctly

#### Swagger Documentation Mismatches
- **Issue**: Documented endpoints don't match implementation
- **Solution**: Update swagger.json or fix route implementations

#### Resource Cleanup Issues
- **Issue**: Sessions not properly terminated
- **Solution**: Check session termination logic and cleanup procedures

## Performance Benchmarks

### Expected Performance
- Session creation: < 5 seconds per session
- API response time: < 1 second for most endpoints
- Test suite completion: < 2 minutes total
- Memory usage: Stable without significant leaks

### Performance Issues
If tests exceed these benchmarks:
1. Check system resources
2. Review session management efficiency
3. Optimize Puppeteer configuration
4. Consider test parallelization limits

## Continuous Integration

### GitHub Actions / CI Setup
```yaml
- name: Run WhatsApp API Tests
  run: |
    npm install
    npm run build
    npm run test:all
  env:
    API_KEY: ${{ secrets.API_KEY }}
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: true
```

### Docker Testing
```bash
# Build and test in Docker
docker-compose up --build
docker-compose exec whatsapp-api npm run test:all
```

## Troubleshooting

### Common Test Failures

1. **Timeout Errors**
   - Increase Jest timeout in test files
   - Check system performance
   - Reduce concurrent operations

2. **Session State Issues**
   - Verify session cleanup between tests
   - Check for race conditions
   - Ensure proper async/await usage

3. **API Endpoint Failures**
   - Verify server is running
   - Check API key configuration
   - Validate request formats

### Debug Mode
```bash
# Run tests with debug output
DEBUG=* npm run test:multi-session

# Run specific test file with verbose output
npx jest tests/multi-session.test.js --verbose
```

## Contributing

When adding new tests:
1. Follow existing test structure and naming conventions
2. Include proper cleanup in `beforeAll`/`afterAll` hooks
3. Use descriptive test names and console logging
4. Add timeout handling for async operations
5. Update this README with new test descriptions

## Test Coverage

The test suite covers:
- ✅ Session management (creation, status, termination)
- ✅ Multi-session isolation and independence
- ✅ API endpoint accessibility and validation
- ✅ Request/response format validation
- ✅ Error handling and edge cases
- ✅ Security and authentication
- ✅ Swagger documentation accuracy
- ✅ Performance and resource management

For additional test coverage, consider adding:
- Load testing with many concurrent sessions
- Long-running session stability tests
- Network failure simulation
- Database persistence testing
