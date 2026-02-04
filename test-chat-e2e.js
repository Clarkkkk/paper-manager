const { chromium } = require('playwright');

async function testChatFunctionality() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const networkRequests = [];
  const allConsoleMessages = [];

  // Capture all console messages
  page.on('console', msg => {
    allConsoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString()
    });
    if (msg.type() === 'error') {
      consoleErrors.push({
        type: 'error',
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
    }
  });

  // Capture network requests
  page.on('request', request => {
    if (request.url().includes('/api/chat')) {
      networkRequests.push({
        type: 'request',
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        postData: request.postData(),
        timestamp: new Date().toISOString()
      });
    }
  });

  // Capture network responses
  page.on('response', response => {
    if (response.url().includes('/api/chat')) {
      networkRequests.push({
        type: 'response',
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        timestamp: new Date().toISOString()
      });
    }
  });

  console.log('=== Starting Chat E2E Test ===');

  try {
    // Step 1: Navigate to dashboard (where papers are)
    console.log('1. Navigating to http://localhost:3000/dashboard...');
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
    console.log('✓ Dashboard page loaded');
    
    await page.waitForTimeout(2000);
    console.log(`Current URL: ${page.url()}`);

    // Step 2: Check if login is needed
    const loginButton = await page.$('a[href="/login"], button:has-text("登录")');
    if (loginButton) {
      console.log('⚠ Login required, attempting login...');
      
      // Try to find credentials
      const testEmail = process.env.TEST_EMAIL || 'test@example.com';
      const testPassword = process.env.TEST_PASSWORD || 'testpassword123';
      
      // Navigate to login page
      await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      
      // Try to login
      const emailInput = await page.$('input[type="email"]');
      const passwordInput = await page.$('input[type="password"]');
      
      if (emailInput && passwordInput) {
        console.log('Filling login form...');
        await emailInput.fill(testEmail);
        await passwordInput.fill(testPassword);
        
        const submitButton = await page.$('button[type="submit"]');
        if (submitButton) {
          await submitButton.click();
          await page.waitForTimeout(3000);
          console.log('✓ Login submitted');
        }
      }
    } else {
      console.log('✓ Already authenticated');
    }

    // Step 3: Look for papers
    console.log('3. Looking for papers...');
    await page.waitForTimeout(2000);
    
    // Look for paper cards/links in the dashboard
    const paperLinks = await page.$$('a[href^="/dashboard/paper/"]');
    console.log(`Found ${paperLinks.length} paper links`);
    
    if (paperLinks.length > 0) {
      console.log('✓ Found papers, clicking first one...');
      await paperLinks[0].click();
      await page.waitForTimeout(3000);
      console.log('✓ Navigated to paper page');
    } else {
      // Try alternative selectors
      const paperCards = await page.$$('[class*="paper"], [class*="card"]');
      console.log(`Found ${paperCards.length} paper cards`);
    }

    // Step 4: Look for chat functionality
    console.log('4. Looking for chat functionality...');
    await page.waitForTimeout(2000);
    
    // Look for chat textarea (Chinese placeholder)
    const chatTextarea = await page.$('textarea[placeholder*="论文"], textarea[placeholder*="ask" i]');
    console.log(`Chat textarea found: ${!!chatTextarea}`);
    
    if (chatTextarea) {
      console.log('✓ Found chat input');
      
      // Send a test message
      const testMessage = '这篇论文的主要贡献是什么？';
      await chatTextarea.fill(testMessage);
      console.log(`✓ Entered message: "${testMessage}"`);
      
      // Look for send button
      const sendButton = await page.$('button[type="submit"], button:has-text("Send"), button:has-text("发送")');
      if (sendButton) {
        console.log('✓ Found send button, clicking...');
        await sendButton.click();
        
        // Wait for response
        console.log('Waiting for chat response...');
        await page.waitForTimeout(5000);
        console.log('✓ Message sent and response received');
      }
    } else {
      console.log('Looking for chat panel elements...');
      const chatPanel = await page.$('[class*="chat"]');
      const messageSquare = await page.$('[class*="message"]');
      console.log(`Chat panel found: ${!!chatPanel}, Message elements: ${!!messageSquare}`);
    }

    // Step 5 & 6: Check results
    console.log('\n=== Test Results ===');
    
    console.log('\n📋 All Console Messages:');
    allConsoleMessages.forEach((msg, i) => {
      console.log(`  ${i + 1}. [${msg.type}] ${msg.text}`);
    });
    
    console.log('\n❌ Console Errors:');
    if (consoleErrors.length === 0) {
      console.log('  No errors found');
    } else {
      consoleErrors.forEach((error, i) => {
        console.log(`  ${i + 1}. [${error.timestamp}] ${error.text}`);
      });
    }
    
    console.log('\n🌐 Network Activity (/api/chat):');
    if (networkRequests.length === 0) {
      console.log('  No /api/chat requests found');
    } else {
      networkRequests.forEach((req, i) => {
        console.log(`  ${i + 1}. [${req.type.toUpperCase()}] ${req.method || ''} ${req.url}`);
        if (req.status) {
          console.log(`     Status: ${req.status} ${req.statusText}`);
        }
        if (req.postData) {
          console.log(`     Payload: ${req.postData}`);
        }
      });
    }

    // Summary
    const hasChatApiCall = networkRequests.some(req => req.type === 'request' && req.url.includes('/api/chat'));
    const hasChatResponse = networkRequests.some(req => req.type === 'response' && req.url.includes('/api/chat'));
    const hasErrors = consoleErrors.length > 0;

    console.log('\n=== Summary ===');
    console.log(`✅ Chat API Called: ${hasChatApiCall ? 'YES' : 'NO'}`);
    console.log(`✅ Chat Response Received: ${hasChatResponse ? 'YES' : 'NO'}`);
    console.log(`❌ Console Errors: ${hasErrors ? 'YES' : 'NO'} (${consoleErrors.length} errors)`);
    
    const success = hasChatApiCall && hasChatResponse && !hasErrors;
    const partial = hasChatApiCall && !hasErrors;
    
    if (success) {
      console.log(`🎉 Overall Status: PASS`);
    } else if (partial) {
      console.log(`⚠️  Overall Status: PARTIAL (API called but no response)`);
    } else {
      console.log(`❌ Overall Status: FAIL`);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    consoleErrors.push({
      type: 'error',
      text: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    console.log('\n=== Detailed Report ===');
    console.log('Console Errors:', JSON.stringify(consoleErrors, null, 2));
    console.log('Network Activity:', JSON.stringify(networkRequests, null, 2));
    
    await browser.close();
  }
}

// Run the test
testChatFunctionality().catch(console.error);
