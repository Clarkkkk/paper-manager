export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          avatar_url: string | null
          openai_api_key: string | null
          preferred_model: string
          api_provider: string | null
          api_base_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          openai_api_key?: string | null
          preferred_model?: string
          api_provider?: string | null
          api_base_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          openai_api_key?: string | null
          preferred_model?: string
          api_provider?: string | null
          api_base_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      papers: {
        Row: {
          id: string
          user_id: string
          title: string
          authors: string | null
          abstract: string | null
          file_url: string
          file_name: string | null
          file_size: number | null
          tags: string[]
          keywords: string | null
          journal: string | null
          published_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          authors?: string | null
          abstract?: string | null
          file_url: string
          file_name?: string | null
          file_size?: number | null
          tags?: string[]
          keywords?: string | null
          journal?: string | null
          published_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          authors?: string | null
          abstract?: string | null
          file_url?: string
          file_name?: string | null
          file_size?: number | null
          tags?: string[]
          keywords?: string | null
          journal?: string | null
          published_date?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      notes: {
        Row: {
          id: string
          paper_id: string
          user_id: string
          content: string
          note_type: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          paper_id: string
          user_id: string
          content: string
          note_type?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          paper_id?: string
          user_id?: string
          content?: string
          note_type?: string
          created_at?: string
          updated_at?: string
        }
      }
      chat_messages: {
        Row: {
          id: string
          paper_id: string
          user_id: string
          role: 'user' | 'assistant'
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          paper_id: string
          user_id: string
          role: 'user' | 'assistant'
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          paper_id?: string
          user_id?: string
          role?: 'user' | 'assistant'
          content?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Helper types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Paper = Database['public']['Tables']['papers']['Row']
export type Note = Database['public']['Tables']['notes']['Row']
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row']
