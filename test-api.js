#!/usr/bin/env node

/**
 * API Test Script for FashionForge
 * Tests all API endpoints to ensure they're working correctly
 */

const https = require('https');
const http = require('http');
const fs = require('fs');

const API_BASE = 'http://localhost:3000';

// Colors for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
}

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = http.request(requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({ status: res.statusCode, data: jsonData, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data, headers: res.headers });
                }
            });
        });

        req.on('error', reject);

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

async function testEndpoint(name, url, options = {}) {
    log(`\n🧪 Testing ${name}...`, 'blue');
    try {
        const result = await makeRequest(url, options);
        if (result.status >= 200 && result.status < 300) {
            log(`✅ ${name} - SUCCESS (${result.status})`, 'green');
            if (options.showData !== false) {
                console.log(JSON.stringify(result.data, null, 2));
            }
            return { success: true, result };
        } else {
            log(`❌ ${name} - FAILED (${result.status})`, 'red');
            console.log(result.data);
            return { success: false, result };
        }
    } catch (error) {
        log(`❌ ${name} - ERROR: ${error.message}`, 'red');
        return { success: false, error };
    }
}

async function runTests() {
    log('🚀 Starting FashionForge API Tests', 'blue');
    log('=====================================', 'blue');

    const results = [];

    // Test 1: Health Check
    results.push(await testEndpoint(
        'Health Check',
        `${API_BASE}/api/health`
    ));

    // Test 2: Categories
    results.push(await testEndpoint(
        'Categories',
        `${API_BASE}/api/categories`
    ));

    // Test 3: CORS Preflight for Upload
    results.push(await testEndpoint(
        'Upload CORS Preflight',
        `${API_BASE}/api/upload`,
        {
            method: 'OPTIONS',
            headers: {
                'Origin': 'http://localhost:5000',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type'
            },
            showData: false
        }
    ));

    // Test 4: Sample Upload
    const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    results.push(await testEndpoint(
        'Sample Image Upload',
        `${API_BASE}/api/upload`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: sampleBase64,
                mimeType: 'image/png'
            })
        }
    ));

    // Test 5: Database Initialization
    results.push(await testEndpoint(
        'Database Initialization',
        `${API_BASE}/api/init-db`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }
    ));

    // Test 6: Seed Defaults
    results.push(await testEndpoint(
        'Seed Default Categories',
        `${API_BASE}/api/seed-defaults`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ types: ['pose'] })
        }
    ));

    // Summary
    log('\n📊 Test Summary', 'blue');
    log('===============', 'blue');
    
    const passed = results.filter(r => r.success).length;
    const total = results.length;
    
    if (passed === total) {
        log(`🎉 All tests passed! (${passed}/${total})`, 'green');
    } else {
        log(`⚠️  ${passed}/${total} tests passed`, 'yellow');
    }

    log('\n✨ API is ready for use!', 'green');
}

// Run the tests
if (require.main === module) {
    runTests().catch(error => {
        log(`💥 Test runner error: ${error.message}`, 'red');
        process.exit(1);
    });
}

module.exports = { runTests, testEndpoint };
