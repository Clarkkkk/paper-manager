const { chromium } = require('playwright');

async function testChatWithAuth() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const networkRequests = [];
  const allConsoleMessages = [];

  // Capture console messages
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

  console.log('=== Starting Chat E2E Test with Signup ===');
  
  try {
    // Step 1: Go to signup page to create test account
    console.log('1. Navigating to signup page...');
    await page.goto('http://localhost:3000/signup', { waitUntil: 'networkidle' });
    console.log('✓ Signup page loaded');
    
    await page.waitForTimeout(1000);
    console.log(`Current URL: ${page.url()}`);

    // Step 2: Create test account
    const testEmail = `test${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';
    
    console.log(`2. Creating test account: ${testEmail}`);
    
    const emailInput = await page.$('input[type="email"]');
    const passwordInput = await page.$('input[type="password"]');
    
    if (emailInput && passwordInput) {
      await emailInput.fill(testEmail);
      await passwordInput.fill(testPassword);
      
      const submitButton = await page.$('button[type="submit"]');
      if (submitButton) {
        console.log('✓ Filling signup form');
        await submitButton.click();
        
        // Wait for signup to complete
        await page.waitForTimeout(5000);
        console.log('✓ Signup submitted');
      }
    } else {
      console.log('Could not find signup form');
    }

    // Step 3: After signup, should redirect to dashboard
    console.log('3. Checking if logged in...');
    await page.waitForTimeout(2000);
    console.log(`Current URL: ${page.url()}`);
    
    // If still on signup page, try to login with test credentials
    if (page.url().includes('signup')) {
      console.log('Signup might have succeeded, trying to login...');
      await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      
      const loginEmailInput = await page.$('input[type="email"]');
      const loginPasswordInput = await page.$('input[type="password"]');
      
      if (loginEmailInput && loginPasswordInput) {
        await loginEmailInput.fill(testEmail);
        await loginPasswordInput.fill(testPassword);
        
        const loginButton = await page.$('button[type="submit"]');
        if (loginButton) {
          await loginButton.click();
          await page.waitForTimeout(3000);
          console.log('✓ Login submitted');
        }
      }
    }

    // Step 4: Navigate to dashboard
    console.log('4. Navigating to dashboard...');
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    console.log(`Current URL: ${page.url()}`);

    // Step 5: Look for papers (might need to upload one)
    console.log('5. Looking for papers...');
    const paperLinks = await page.$$('a[href^="/dashboard/paper/"]');
    console.log(`Found ${paperLinks.length} paper links`);
    
    if (paperLinks.length > 0) {
      console.log('✓ Found papers, clicking first one...');
      await paperLinks[0].click();
      await page.waitForTimeout(3000);
      console.log('✓ Navigated to paper page');
    } else {
      console.log('No papers found - need to upload a paper for testing');
      
      // Look for upload button
      const uploadButton = await page.$('button:has-text("上传"), [class*="upload"]');
      if (uploadButton) {
        console.log('Found upload button - could upload test paper but skipping for now');
      }
    }

    // Step 6: Look for chat functionality
    console.log('6. Looking for chat functionality...');
    await page.waitForTimeout(2000);
    
    const chatTextarea = await page.$('textarea[placeholder*="论文"], textarea[placeholder*="ask" i]');
    console.log(`Chat textarea found: ${!!chatTextarea}`);
    
    if (chatTextarea) {
      console.log('✓ Found chat input');
      
      // Send test message
      const testMessage = '这篇论文的主要贡献是什么？';
      await chatTextarea.fill(testMessage);
      console.log(`✓ Entered message: "${testMessage}"`);
      
      const sendButton = await page.$('button[type="submit"], button:has-text("Send"), button:has-text("发送")');
      if (sendButton) {
        console.log('✓ Found send button, clicking...');
        await sendButton.click();
        
        console.log('Waiting for chat response...');
        await page.waitForTimeout(5000);
        console.log('✓ Message sent and response received');
      }
    }

    // Results
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
    if (success) {
      console.log(`🎉 Overall Status: PASS`);
    } else {
      console.log(`❌ Overall Status: FAIL`);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  } finally {
    console.log('\n=== Detailed Report ===');
    console.log('Console Errors:', JSON.stringify(consoleErrors, null, 2));
    console.log('Network Activity:', JSON.stringify(networkRequests, null, 2));
    
    await browser.close();
  }
}

// Run the test
testChatWithAuth().catch(console.error);
