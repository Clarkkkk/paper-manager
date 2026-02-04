import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET: 获取用户的所有论文
export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: papers, error } = await supabase
      .from('papers')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ papers })
    
  } catch (error) {
    console.error('Get papers error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: 创建新论文记录
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { title, authors, abstract, file_url, file_name, file_size, tags, keywords, journal } = body

    if (!title || !file_url) {
      return NextResponse.json(
        { error: 'Title and file_url are required' },
        { status: 400 }
      )
    }

    // 基础插入数据（包含所有字段）
    const insertData: Record<string, unknown> = {
      user_id: user.id,
      title,
      authors: authors || null,
      abstract: abstract || null,
      file_url,
      file_name: file_name || null,
      file_size: file_size || null,
      tags: tags || [],
      keywords: keywords || null,
      journal: journal || null,
    }

    // 使用 any 绕过 Supabase 类型推断问题
    const supabaseAny = supabase as any

    // 直接插入所有字段
    const { data: result, error } = await supabaseAny
      .from('papers')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('Insert paper error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ paper: result }, { status: 201 })
    
  } catch (error) {
    console.error('Create paper error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH: 更新论文信息
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const supabaseAny = supabase as any
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('PATCH auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    console.log('PATCH request body:', JSON.stringify(body))
    const { id, title, authors, abstract, tags, keywords, journal } = body

    if (!id) {
      return NextResponse.json({ error: 'Paper ID is required' }, { status: 400 })
    }

    // 基础更新数据
    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title
    if (authors !== undefined) updateData.authors = authors
    if (abstract !== undefined) updateData.abstract = abstract
    if (tags !== undefined) updateData.tags = tags
    if (keywords !== undefined) updateData.keywords = keywords
    if (journal !== undefined) updateData.journal = journal

    console.log('PATCH updateData:', JSON.stringify(updateData))

    const { data: paper, error } = await supabaseAny
      .from('papers')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    console.log('PATCH result, data:', paper, 'error:', error)

    if (error) {
      console.error('PATCH error:', error)
      // 如果是因为缺少列的错误，尝试只更新基础字段
      if (error.message.includes('column') || error.message.includes('schema')) {
        const basicUpdate: Record<string, unknown> = {}
        if (title !== undefined) basicUpdate.title = title
        if (authors !== undefined) basicUpdate.authors = authors
        if (abstract !== undefined) basicUpdate.abstract = abstract
        if (tags !== undefined) basicUpdate.tags = tags
        
        const retryResult = await supabaseAny
          .from('papers')
          .update(basicUpdate)
          .eq('id', id)
          .eq('user_id', user.id)
          .select()
          .single()
        
        if (retryResult.error) {
          return NextResponse.json({ error: retryResult.error.message }, { status: 500 })
        }
        return NextResponse.json({ paper: retryResult.data })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ paper })
    
  } catch (error) {
    console.error('Update paper error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: 删除论文
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const supabaseAny = supabase as any
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const paperId = searchParams.get('id')

    if (!paperId) {
      return NextResponse.json({ error: 'Paper ID is required' }, { status: 400 })
    }

    // 先获取论文信息以删除存储文件
    const { data: paperResult } = await supabaseAny
      .from('papers')
      .select('file_url')
      .eq('id', paperId)
      .eq('user_id', user.id)
      .single()

    const paper = paperResult as { file_url: string } | null

    if (paper?.file_url) {
      // 从 Storage 删除文件
      const filePath = paper.file_url.replace(/^.*\/papers\//, '')
      await supabase.storage.from('papers').remove([filePath])
    }

    // 删除论文记录（级联删除 notes 和 chat_messages）
    const { error } = await supabase
      .from('papers')
      .delete()
      .eq('id', paperId)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Delete paper error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
