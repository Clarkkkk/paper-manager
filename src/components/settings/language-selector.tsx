'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Globe, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LanguageSelectorProps {
  currentLanguage: 'zh' | 'en'
  onLanguageChange: (lang: 'zh' | 'en') => void
}

const languages = [
  { id: 'zh', name: '中文', nativeName: '简体中文', flag: '🇨🇳' },
  { id: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
] as const

export function LanguageSelector({ currentLanguage, onLanguageChange }: LanguageSelectorProps) {
  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center">
            <Globe className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-zinc-100">语言 / Language</CardTitle>
            <CardDescription className="text-zinc-500">
              选择界面显示语言
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {languages.map((lang) => {
          const isSelected = currentLanguage === lang.id
          return (
            <button
              key={lang.id}
              onClick={() => onLanguageChange(lang.id)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                isSelected 
                  ? 'border-blue-500/50 bg-blue-500/5' 
                  : 'border-zinc-800 hover:border-zinc-700 bg-zinc-800/30'
              )}
            >
              <span className="text-2xl">{lang.flag}</span>
              <div className="flex-1">
                <div className="font-medium text-zinc-200">{lang.name}</div>
                <div className="text-xs text-zinc-500">{lang.nativeName}</div>
              </div>
              {isSelected && (
                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
