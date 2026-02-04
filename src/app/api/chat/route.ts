import { streamText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getAIClient, RAG_SYSTEM_PROMPT } from '@/lib/ai/openai'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const supabaseAny = supabase as any
    
    // 验证用户身份
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { messages, paperId, paperContent, model: customModel } = await req.json()
    
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Invalid messages format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 获取论文信息（用于 RAG 上下文）
    let paperContext = ''
    if (paperId) {
      const { data: paperDataResult } = await supabase
        .from('papers')
        .select('title, abstract, authors')
        .eq('id', paperId)
        .eq('user_id', user.id)
        .single()

      const paperData = paperDataResult as { title: string; abstract?: string; authors?: string } | null
      
      if (paperData) {
        paperContext = `
【论文标题】${paperData.title}
【作者】${paperData.authors || '未知'}
【摘要】${paperData.abstract || '暂无摘要'}
`
      }
      
      // 如果前端传入了 PDF 内容，使用它（限制长度避免超出配额）
      if (paperContent) {
        const maxChatLength = 20000
        const truncatedContent = paperContent.slice(0, maxChatLength)
        paperContext += `\n\n【论文全文内容（部分）】\n${truncatedContent}`
      }
    }

    // 获取 AI 客户端配置
    const { client, model: defaultModel, hasCustomKey } = await getAIClient()
    
    // 优先使用前端传递的模型，其次使用用户设置，最后使用默认值
    const modelId = customModel || defaultModel
    
    console.log(`[Chat API] Using model: ${modelId}, custom: ${!!customModel}`)
    
    // 构建系统消息
    const systemMessage = paperContext 
      ? `${RAG_SYSTEM_PROMPT}\n\n--- Paper Context ---\n${paperContext}`
      : RAG_SYSTEM_PROMPT

    // 使用 Vercel AI SDK 流式响应
    const result = await streamText({
      model: client(modelId),
      system: systemMessage,
      messages,
      maxOutputTokens: 2048,
      temperature: 0.7,
      onError({ error }) {
        console.error('[Chat API] Stream error:', error)
      },
    })

    // 存储用户消息到数据库（可选）
    if (paperId && messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage.role === 'user') {
        await supabaseAny.from('chat_messages').insert({
          paper_id: paperId,
          user_id: user.id,
          role: 'user',
          content: lastMessage.content,
        } as any)
      }
    }

    // 返回流式响应
    return result.toTextStreamResponse({
      headers: {
        'X-Model-Used': modelId,
        'X-Has-Custom-Key': String(hasCustomKey),
      },
    })
    
  } catch (error) {
    console.error('Chat API Error:', error)
    
    let errorMessage = 'Internal server error'
    let statusCode = 500
    
    if (error instanceof Error) {
      // 检测 API 配额错误 / 限流
      if (error.message.includes('429') || 
          error.message.includes('RESOURCE_EXHAUSTED') || 
          error.message.includes('quota') ||
          error.message.includes('rate-limit') ||
          error.message.includes('rate limited') ||
          error.message.includes('upstream')) {
        errorMessage = '⚠️ 免费模型暂时不可用，请稍后再试或配置自己的 API Key'
        statusCode = 429
      } else if (error.message.includes('Unauthorized') || error.message.includes('invalid api key')) {
        errorMessage = 'API Key 无效，请检查配置'
        statusCode = 401
      } else {
        errorMessage = error.message
      }
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: statusCode, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
