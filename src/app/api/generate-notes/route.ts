import { streamText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getAIClient, GENERATE_NOTES_PROMPT } from '@/lib/ai/openai'
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

    const { paperId, paperContent } = await req.json()
    
    if (!paperId) {
      return new Response(
        JSON.stringify({ error: 'Paper ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 验证论文归属
    const { data: paper, error: paperError } = await supabase
      .from('papers')
      .select('id, title, abstract, authors')
      .eq('id', paperId)
      .eq('user_id', user.id)
      .single()

    if (paperError || !paper) {
      return new Response(
        JSON.stringify({ error: 'Paper not found or access denied' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Type assertion since Supabase generic typing is unreliable
    const paperData = paper as { id: string; title: string; abstract?: string; authors?: string }

    // 构建论文内容上下文
    const context = `
Title: ${paperData.title}
Authors: ${paperData.authors || 'Unknown'}
Abstract: ${paperData.abstract || 'Not provided'}

${paperContent ? `Full Text Content:\n${paperContent.slice(0, 15000)}` : ''}
`

    // 动态获取 AI 客户端（模型由服务端根据用户 profile 统一决定）
    const { client, model: modelId } = await getAIClient()
    
    console.log(`[Generate Notes] Using model: ${modelId}`)

    // 流式生成笔记
    const result = await streamText({
      model: client(modelId),
      system: GENERATE_NOTES_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please analyze this paper and generate structured notes:\n\n${context}`,
        },
      ],
      maxOutputTokens: 4096,
      temperature: 0.3,
      onError({ error }) {
        console.error('[Generate Notes] Stream error:', error)
      },
      onFinish: async ({ text }) => {
        try {
          // 先检查是否存在笔记
          const { data: existingNoteData } = await supabaseAny
            .from('notes')
            .select('id')
            .eq('paper_id', paperId)
            .eq('user_id', user.id)
            .eq('note_type', 'summary')
            .single()
          
          const existingNote = existingNoteData as { id: string } | null
          
          if (existingNote) {
            // 更新现有笔记 - 使用 any 类型绕过 Supabase 类型推断
            const supabaseAny = supabase as any
            await supabaseAny.from('notes').update({ content: text }).eq('id', existingNote.id)
          } else {
            // 创建新笔记
            await supabaseAny.from('notes').insert({
              paper_id: paperId,
              user_id: user.id,
              content: text,
              note_type: 'summary',
            })
          }
          console.log('[Generate Notes] Note saved successfully')
        } catch (saveError) {
          console.error('[Generate Notes] Failed to save note:', saveError)
        }
      },
    })

    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('Generate Notes API Error:', error)
    
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
