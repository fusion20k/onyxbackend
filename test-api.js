const axios = require('axios');

const API_URL = 'http://localhost:3000/api';
let authToken = '';
let userId = '';
let testEmail = `test-${Date.now()}@example.com`;
let testPassword = 'TestPassword123!';

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    reset: '\x1b[0m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
    console.log(`\n${colors.blue}Testing: ${name}${colors.reset}`);
}

async function testHealthCheck() {
    logTest('Health Check');
    try {
        const response = await axios.get('http://localhost:3000/health');
        if (response.data.status === 'ok') {
            log('✓ Health check passed', 'green');
            return true;
        }
    } catch (error) {
        log(`✗ Health check failed: ${error.message}`, 'red');
        return false;
    }
}

async function testSignup() {
    logTest('POST /auth/signup');
    try {
        const response = await axios.post(`${API_URL}/auth/signup`, {
            name: 'Test User',
            email: testEmail,
            password: testPassword,
            company: 'Test Company'
        });

        if (response.data.success && response.data.token) {
            authToken = response.data.token;
            userId = response.data.user.id;
            log('✓ Signup successful', 'green');
            log(`  User ID: ${userId}`, 'yellow');
            log(`  Trial days: ${response.data.user.trial_days_remaining}`, 'yellow');
            return true;
        }
    } catch (error) {
        log(`✗ Signup failed: ${error.response?.data?.error || error.message}`, 'red');
        return false;
    }
}

async function testAuthStatus() {
    logTest('GET /auth/status');
    try {
        const response = await axios.get(`${API_URL}/auth/status`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });

        if (response.data.user) {
            log('✓ Auth status check passed', 'green');
            log(`  Onboarding complete: ${response.data.user.onboarding_complete}`, 'yellow');
            return true;
        }
    } catch (error) {
        log(`✗ Auth status failed: ${error.response?.data?.error || error.message}`, 'red');
        return false;
    }
}

async function testOnboardingSave() {
    logTest('POST /onboarding/save');
    try {
        const response = await axios.post(`${API_URL}/onboarding/save`, {
            target_industries: ['Technology', 'SaaS'],
            company_size: '1-10',
            titles: ['CEO', 'CTO'],
            geography: 'United States',
            messaging_tone: 'Professional'
        }, {
            headers: { Authorization: `Bearer ${authToken}` }
        });

        if (response.data.success) {
            log('✓ Onboarding data saved', 'green');
            return true;
        }
    } catch (error) {
        log(`✗ Onboarding save failed: ${error.response?.data?.error || error.message}`, 'red');
        return false;
    }
}

async function testOnboardingComplete() {
    logTest('POST /onboarding/complete');
    try {
        const response = await axios.post(`${API_URL}/onboarding/complete`, {}, {
            headers: { Authorization: `Bearer ${authToken}` }
        });

        if (response.data.success && response.data.user.onboarding_complete) {
            log('✓ Onboarding completed', 'green');
            return true;
        }
    } catch (error) {
        log(`✗ Onboarding complete failed: ${error.response?.data?.error || error.message}`, 'red');
        return false;
    }
}

async function testOnboardingData() {
    logTest('GET /onboarding/data');
    try {
        const response = await axios.get(`${API_URL}/onboarding/data`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });

        if (response.data.onboarding_complete) {
            log('✓ Onboarding data retrieved', 'green');
            log(`  Industries: ${response.data.onboarding_data?.target_industries}`, 'yellow');
            return true;
        }
    } catch (error) {
        log(`✗ Onboarding data retrieval failed: ${error.response?.data?.error || error.message}`, 'red');
        return false;
    }
}

async function testWorkspaceMetrics() {
    logTest('GET /workspace/metrics');
    try {
        const response = await axios.get(`${API_URL}/workspace/metrics`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });

        if (response.data.leads_contacted !== undefined) {
            log('✓ Workspace metrics retrieved', 'green');
            log(`  Leads contacted: ${response.data.leads_contacted}`, 'yellow');
            log(`  Reply rate: ${response.data.reply_rate}%`, 'yellow');
            return true;
        }
    } catch (error) {
        log(`✗ Workspace metrics failed: ${error.response?.data?.error || error.message}`, 'red');
        return false;
    }
}

async function testWorkspacePipeline() {
    logTest('GET /workspace/pipeline');
    try {
        const response = await axios.get(`${API_URL}/workspace/pipeline`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });

        if (response.data.new !== undefined) {
            log('✓ Workspace pipeline retrieved', 'green');
            log(`  New leads: ${response.data.new.length}`, 'yellow');
            return true;
        }
    } catch (error) {
        log(`✗ Workspace pipeline failed: ${error.response?.data?.error || error.message}`, 'red');
        return false;
    }
}

async function testWorkspaceCampaign() {
    logTest('GET /workspace/campaign');
    try {
        const response = await axios.get(`${API_URL}/workspace/campaign`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });

        log('✓ Workspace campaign retrieved', 'green');
        return true;
    } catch (error) {
        log(`✗ Workspace campaign failed: ${error.response?.data?.error || error.message}`, 'red');
        return false;
    }
}

async function testPaymentConfig() {
    logTest('GET /payment/config');
    try {
        const response = await axios.get(`${API_URL}/payment/config`);

        if (response.data.publishableKey) {
            log('✓ Payment config retrieved', 'green');
            return true;
        }
    } catch (error) {
        log(`✗ Payment config failed: ${error.response?.data?.error || error.message}`, 'red');
        return false;
    }
}

async function runAllTests() {
    log('\n╔══════════════════════════════════════════╗', 'blue');
    log('║  ONYX BACKEND API TEST SUITE             ║', 'blue');
    log('╚══════════════════════════════════════════╝\n', 'blue');

    const results = {
        passed: 0,
        failed: 0
    };

    const tests = [
        { name: 'Health Check', fn: testHealthCheck },
        { name: 'Signup', fn: testSignup },
        { name: 'Auth Status', fn: testAuthStatus },
        { name: 'Onboarding Save', fn: testOnboardingSave },
        { name: 'Onboarding Complete', fn: testOnboardingComplete },
        { name: 'Onboarding Data', fn: testOnboardingData },
        { name: 'Workspace Metrics', fn: testWorkspaceMetrics },
        { name: 'Workspace Pipeline', fn: testWorkspacePipeline },
        { name: 'Workspace Campaign', fn: testWorkspaceCampaign },
        { name: 'Payment Config', fn: testPaymentConfig }
    ];

    for (const test of tests) {
        const result = await test.fn();
        if (result) {
            results.passed++;
        } else {
            results.failed++;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    log('\n╔══════════════════════════════════════════╗', 'blue');
    log('║  TEST RESULTS                            ║', 'blue');
    log('╚══════════════════════════════════════════╝\n', 'blue');
    log(`Total Tests: ${results.passed + results.failed}`, 'yellow');
    log(`Passed: ${results.passed}`, 'green');
    log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
    log(`\nTest Email: ${testEmail}`, 'yellow');
    log(`Test Password: ${testPassword}\n`, 'yellow');
}

runAllTests().catch(error => {
    log(`Fatal error: ${error.message}`, 'red');
    process.exit(1);
});
