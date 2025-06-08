#!/usr/bin/env node

/**
 * Comprehensive Test Report Generator for WhatsApp API
 *
 * This script runs all tests and generates a detailed report of:
 * 1. Swagger documentation validation
 * 2. Multi-session functionality testing
 * 3. API endpoint validation
 * 4. Performance and resource management
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

class TestReporter {
  constructor () {
    this.results = {
      swagger: null,
      multiSession: null,
      api: null,
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        duration: 0
      },
      issues: [],
      recommendations: []
    }
    this.startTime = Date.now()
  }

  log (message, level = 'INFO') {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [${level}] ${message}`)
  }

  async runTest (testName, command) {
    this.log(`Starting ${testName} tests...`)

    try {
      const output = execSync(command, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 120000 // 2 minutes timeout
      })

      const result = this.parseJestOutput(output)
      this.log(`${testName} tests completed: ${result.passed}/${result.total} passed`)

      return {
        success: true,
        ...result,
        output
      }
    } catch (error) {
      this.log(`${testName} tests failed: ${error.message}`, 'ERROR')

      const result = this.parseJestOutput(error.stdout || error.message)
      return {
        success: false,
        ...result,
        error: error.message,
        output: error.stdout || error.message
      }
    }
  }

  parseJestOutput (output) {
    const result = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0
    }

    // Parse Jest output for test results
    const testSuiteMatch = output.match(/Test Suites:.*?(\d+) passed.*?(\d+) total/)
    const testMatch = output.match(/Tests:.*?(\d+) passed.*?(\d+) total/)
    const timeMatch = output.match(/Time:\s*(\d+\.?\d*)\s*s/)

    if (testMatch) {
      result.passed = parseInt(testMatch[1]) || 0
      result.total = parseInt(testMatch[2]) || 0
      result.failed = result.total - result.passed
    }

    if (timeMatch) {
      result.duration = parseFloat(timeMatch[1]) || 0
    }

    return result
  }

  async runAllTests () {
    this.log('Starting comprehensive WhatsApp API test suite...')

    // Build the project first
    try {
      this.log('Building project...')
      execSync('npm run build', { stdio: 'inherit' })
      this.log('Build completed successfully')
    } catch (error) {
      this.log('Build failed: ' + error.message, 'ERROR')
      this.results.issues.push('Build failed - cannot run tests')
      return
    }

    // Run Swagger validation tests
    this.results.swagger = await this.runTest(
      'Swagger Documentation',
      'npm run test:swagger'
    )

    // Run API tests
    this.results.api = await this.runTest(
      'Basic API',
      'npm run test:api'
    )

    // Run multi-session tests
    this.results.multiSession = await this.runTest(
      'Multi-Session',
      'npm run test:multi-session'
    )

    this.calculateSummary()
    this.analyzeResults()
    this.generateReport()
  }

  calculateSummary () {
    const tests = [this.results.swagger, this.results.api, this.results.multiSession]

    this.results.summary = tests.reduce((summary, test) => {
      if (test) {
        summary.totalTests += test.total
        summary.passedTests += test.passed
        summary.failedTests += test.failed
        summary.skippedTests += test.skipped
        summary.duration += test.duration
      }
      return summary
    }, {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      duration: 0
    })

    this.results.summary.duration = Date.now() - this.startTime
  }

  analyzeResults () {
    const { swagger, api, multiSession, summary } = this.results

    // Analyze Swagger documentation
    if (swagger && !swagger.success) {
      this.results.issues.push('Swagger documentation validation failed')
      this.results.recommendations.push('Review and fix Swagger/OpenAPI documentation')
    }

    // Analyze API functionality
    if (api && !api.success) {
      this.results.issues.push('Basic API functionality tests failed')
      this.results.recommendations.push('Check API endpoint implementations and error handling')
    }

    // Analyze multi-session functionality
    if (multiSession && !multiSession.success) {
      this.results.issues.push('Multi-session functionality tests failed')
      this.results.recommendations.push('Review session management and isolation mechanisms')
    }

    // Performance analysis
    if (summary.duration > 60000) { // More than 1 minute
      this.results.issues.push('Test suite execution time is high')
      this.results.recommendations.push('Consider optimizing test performance and session management')
    }

    // Success rate analysis
    const successRate = summary.totalTests > 0 ? (summary.passedTests / summary.totalTests) * 100 : 0
    if (successRate < 90) {
      this.results.issues.push(`Low test success rate: ${successRate.toFixed(1)}%`)
      this.results.recommendations.push('Address failing tests to improve API reliability')
    }

    // Add positive recommendations
    if (swagger && swagger.success) {
      this.results.recommendations.push('✓ Swagger documentation is properly validated')
    }
    if (multiSession && multiSession.success) {
      this.results.recommendations.push('✓ Multi-session functionality is working correctly')
    }
    if (api && api.success) {
      this.results.recommendations.push('✓ Basic API functionality is working correctly')
    }
  }

  generateReport () {
    const { summary, issues, recommendations } = this.results

    console.log('\n' + '='.repeat(80))
    console.log('                    WHATSAPP API TEST REPORT')
    console.log('='.repeat(80))

    console.log('\n📊 SUMMARY:')
    console.log(`   Total Tests: ${summary.totalTests}`)
    console.log(`   Passed: ${summary.passedTests} (${summary.totalTests > 0 ? ((summary.passedTests / summary.totalTests) * 100).toFixed(1) : 0}%)`)
    console.log(`   Failed: ${summary.failedTests}`)
    console.log(`   Skipped: ${summary.skippedTests}`)
    console.log(`   Duration: ${(summary.duration / 1000).toFixed(2)}s`)

    console.log('\n📋 TEST CATEGORIES:')

    if (this.results.swagger) {
      console.log(`   Swagger Documentation: ${this.results.swagger.success ? '✅ PASS' : '❌ FAIL'} (${this.results.swagger.passed}/${this.results.swagger.total})`)
    }

    if (this.results.api) {
      console.log(`   Basic API Tests: ${this.results.api.success ? '✅ PASS' : '❌ FAIL'} (${this.results.api.passed}/${this.results.api.total})`)
    }

    if (this.results.multiSession) {
      console.log(`   Multi-Session Tests: ${this.results.multiSession.success ? '✅ PASS' : '❌ FAIL'} (${this.results.multiSession.passed}/${this.results.multiSession.total})`)
    }

    if (issues.length > 0) {
      console.log('\n⚠️  ISSUES FOUND:')
      issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`)
      })
    }

    if (recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:')
      recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`)
      })
    }

    console.log('\n' + '='.repeat(80))

    const overallStatus = summary.failedTests === 0 && issues.length === 0 ? 'PASS' : 'FAIL'
    console.log(`OVERALL STATUS: ${overallStatus === 'PASS' ? '✅ PASS' : '❌ FAIL'}`)
    console.log('='.repeat(80))

    // Save detailed report to file
    this.saveDetailedReport()
  }

  saveDetailedReport () {
    const reportData = {
      timestamp: new Date().toISOString(),
      results: this.results,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      }
    }

    const reportPath = path.join(__dirname, 'test-report.json')
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2))

    this.log(`Detailed report saved to: ${reportPath}`)
  }
}

// Run the test reporter if this script is executed directly
if (require.main === module) {
  const reporter = new TestReporter()
  reporter.runAllTests().catch(error => {
    console.error('Test runner failed:', error)
    process.exit(1)
  })
}

module.exports = TestReporter
