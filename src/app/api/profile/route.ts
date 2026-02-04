import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET: 获取用户 Profile
export async function GET() {
  try {
    const supabase = await createClient()
    const supabaseAny = supabase as any
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) {
      // 如果 profile 不存在，创建一个
      if (error.code === 'PGRST116') {
        const { data: newProfile, error: createError } = await supabaseAny
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email,
          })
          .select()
          .single()
        
        if (createError) {
          return NextResponse.json({ error: createError.message }, { status: 500 })
        }
        return NextResponse.json({ profile: newProfile })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 使用 any 绕过类型推断问题
    const profileAny = profile as any
    // 隐藏部分 API Key
    if (profileAny.openai_api_key) {
      profileAny.openai_api_key = maskApiKey(profileAny.openai_api_key)
    }

    // 检查系统是否配置了默认 API Key
    const hasSystemApiKey = !!process.env.GOOGLE_API_KEY || !!process.env.SYSTEM_OPENAI_API_KEY

    return NextResponse.json({ 
      profile: profileAny,
      hasSystemApiKey,
      defaultProvider: process.env.GOOGLE_API_KEY ? 'google' : (process.env.SYSTEM_OPENAI_API_KEY ? 'openai' : null),
    })
    
  } catch (error) {
    console.error('Get profile error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH: 更新用户 Profile
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const supabaseAny = supabase as any
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { openai_api_key, preferred_model, full_name, avatar_url, api_provider, api_base_url } = body

    // 构建更新对象，只包含提供的字段
    const updates: Record<string, unknown> = {}
    
    if (openai_api_key !== undefined) {
      // 如果是空字符串，则清除 API Key
      updates.openai_api_key = openai_api_key || null
    }
    
    if (preferred_model !== undefined) {
      updates.preferred_model = preferred_model
    }
    
    if (full_name !== undefined) {
      updates.full_name = full_name
    }
    
    if (avatar_url !== undefined) {
      updates.avatar_url = avatar_url
    }
    
    if (api_provider !== undefined) {
      updates.api_provider = api_provider
    }
    
    if (api_base_url !== undefined) {
      updates.api_base_url = api_base_url || null
    }

    // 尝试更新（先包含所有字段）
    let result = await supabaseAny
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()

    // 如果失败，尝试只更新基本字段
    if (result.error) {
      const basicUpdates: Record<string, unknown> = {}
      if (openai_api_key !== undefined) basicUpdates.openai_api_key = openai_api_key || null
      if (preferred_model !== undefined) basicUpdates.preferred_model = preferred_model
      if (full_name !== undefined) basicUpdates.full_name = full_name
      if (avatar_url !== undefined) basicUpdates.avatar_url = avatar_url
      
      result = await supabaseAny
        .from('profiles')
        .update(basicUpdates)
        .eq('id', user.id)
        .select()
        .single()
      
      if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 500 })
      }
    }

    // 隐藏部分 API Key
    if (result.data?.openai_api_key) {
      result.data.openai_api_key = maskApiKey(result.data.openai_api_key)
    }

    return NextResponse.json({ profile: result.data })
    
  } catch (error) {
    console.error('Update profile error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// 辅助函数：隐藏 API Key 中间部分
function maskApiKey(key: string): string {
  if (key.length <= 8) return '****'
  return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`
}
