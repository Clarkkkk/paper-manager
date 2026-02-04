const { createOpenRouter } = require('@openrouter/ai-sdk-provider');
const { streamText } = require('ai');

const models = [
  'liquid/lfm-2.5-1.2b-instruct:free',
  'google/gemma-3-4b-it:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'deepseek/deepseek-r1-0528:free',
  'google/gemma-3-12b-it:free',
];

async function testModel(modelId) {
  const openrouter = createOpenRouter({
    apiKey: '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',
    headers: {
      'HTTP-Referer': 'https://myscispace.app',
      'X-Title': 'MySciSpace',
    },
  });

  try {
    const result = await streamText({
      model: openrouter.chat(modelId),
      messages: [{ role: 'user', content: 'Hello' }],
      maxOutputTokens: 50,
    });

    const response = result.toTextStreamResponse();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let text = '';
    let timeout = setTimeout(() => { throw new Error('Timeout') }, 10000);
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    
    clearTimeout(timeout);
    console.log(`✅ ${modelId.split('/')[1]?.slice(0, 25).padEnd(25)}: ${text.slice(0, 50)}`);
    return true;
  } catch (error) {
    console.log(`❌ ${modelId.split('/')[1]?.slice(0, 25).padEnd(25)}: ${error.message.slice(0, 60)}`);
    return false;
  }
}

async function testAll() {
  console.log('测试 OpenRouter 免费模型可用性...\n');
  for (const model of models) {
    await testModel(model);
    await new Promise(r => setTimeout(r, 1000));
  }
}

testAll();
