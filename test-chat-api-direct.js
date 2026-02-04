const { chromium } = require('playwright');

async function testChatAPIDirectly() {
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

  // Capture all network requests
  page.on('request', request => {
    networkRequests.push({
      type: 'request',
      url: request.url(),
      method: request.method(),
      status: request.url().includes('/api/') ? 'pending' : 'info',
      timestamp: new Date().toISOString()
    });
  });

  // Capture all network responses
  page.on('response', response => {
    if (response.status() >= 400) {
      consoleErrors.push({
        type: 'error',
        text: `HTTP ${response.status()}: ${response.url()}`,
        timestamp: new Date().toISOString()
      });
    }
    networkRequests.push({
      type: 'response',
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      timestamp: new Date().toISOString()
    });
  });

  console.log('=== Testing Chat API Directly ===');

  try {
    // Navigate to home page first
    console.log('1. Loading home page...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    console.log('✓ Home page loaded');
    
    // Try to navigate directly to a paper page (bypassing auth for API testing)
    // We'll test if the API endpoint responds
    console.log('2. Testing /api/chat endpoint directly...');
    
    // Try to call the chat API directly using page.evaluate to bypass auth
    const apiResult = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Test message' }],
            paperId: 'test-paper-id',
            paperContent: 'This is test content'
          })
        });
        
        return {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          body: await response.text()
        };
      } catch (error) {
        return {
          error: error.message
        };
      }
    });
    
    console.log('API Response:', JSON.stringify(apiResult, null, 2));
    
    // Check current authentication state
    console.log('3. Checking authentication state...');
    const authState = await page.evaluate(async () => {
      // Check if we can access Supabase
      try {
        const supabaseUrl = window.localStorage.getItem('supabase.auth.token');
        return {
          hasSupabaseToken: !!supabaseUrl,
          url: window.location.href
        };
      } catch (e) {
        return { error: e.message };
      }
    });
    
    console.log('Auth State:', JSON.stringify(authState, null, 2));
    
    // Try to find any existing papers or chat interface elements
    console.log('4. Checking page structure...');
    const pageStructure = await page.evaluate(() => {
      return {
        title: document.title,
        bodyClasses: document.body.className,
        hasMainContent: !!document.querySelector('main'),
        hasChatElements: !!document.querySelector('[class*="chat"]'),
        hasPaperElements: !!document.querySelector('[class*="paper"]'),
        url: window.location.href
      };
    });
    
    console.log('Page Structure:', JSON.stringify(pageStructure, null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Final Report
    console.log('\n=== Final Report ===');
    
    console.log('\n📋 All Console Messages:');
    allConsoleMessages.slice(0, 10).forEach((msg, i) => {
      console.log(`  ${i + 1}. [${msg.type}] ${msg.text.substring(0, 100)}`);
    });
    
    console.log('\n❌ Console Errors:');
    if (consoleErrors.length === 0) {
      console.log('  No errors found');
    } else {
      consoleErrors.forEach((error, i) => {
        console.log(`  ${i + 1}. [${error.timestamp}] ${error.text}`);
      });
    }
    
    console.log('\n🌐 Network Activity (API calls):');
    const apiCalls = networkRequests.filter(r => r.url.includes('/api/') || r.url.includes('supabase'));
    if (apiCalls.length === 0) {
      console.log('  No API calls found');
    } else {
      apiCalls.forEach((req, i) => {
        console.log(`  ${i + 1}. [${req.type.toUpperCase()}] ${req.method || ''} ${req.url}`);
        if (req.status) {
          console.log(`     Status: ${req.status}`);
        }
      });
    }

    console.log('\n=== Summary ===');
    console.log(`Total Console Errors: ${consoleErrors.length}`);
    console.log(`Total Network Requests: ${networkRequests.length}`);
    console.log(`API Calls Found: ${networkRequests.filter(r => r.url.includes('/api/')).length}`);
    
    await browser.close();
  }
}

// Run the test
testChatAPIDirectly().catch(console.error);
