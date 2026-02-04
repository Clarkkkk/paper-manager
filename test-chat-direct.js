const { createOpenRouter } = require('@openrouter/ai-sdk-provider');
const { streamText } = require('ai');

async function testChatAPI() {
  const openrouter = createOpenRouter({
    apiKey: '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',
    headers: {
      'HTTP-Referer': 'https://myscispace.app',
      'X-Title': 'MySciSpace',
    },
  });

  console.log('=== Testing Chat API ===');
  
  try {
    const result = await streamText({
      model: openrouter.chat('liquid/lfm-2.5-1.2b-instruct:free'),
      messages: [
        { role: 'user', content: '这篇论文的主要贡献是什么？' }
      ],
      maxOutputTokens: 200,
      temperature: 0.7,
      onError({ error }) {
        console.error('[onError] Error caught:', error);
      },
    });

    console.log('✅ streamText returned result');
    
    const response = result.toTextStreamResponse();
    console.log('✅ toTextStreamResponse created');
    console.log('Response headers:', [...response.headers.entries()]);
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let fullText = '';
    let chunkCount = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      chunkCount++;
      const chunk = decoder.decode(value);
      fullText += chunk;
      
      if (chunkCount <= 3) {
        console.log(`Chunk ${chunkCount}:`, chunk.slice(0, 100));
      }
    }
    
    console.log(`\n✅ 成功收到 ${chunkCount} 个数据块`);
    console.log(`总长度: ${fullText.length} 字符`);
    console.log('完整内容:', fullText);
    
  } catch (error) {
    console.error('❌ Chat API 测试失败:', error.message);
    console.error('Error details:', error);
  }
}

testChatAPI();
