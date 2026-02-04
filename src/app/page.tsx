import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BookOpen, Sparkles, Upload, MessageSquare, Shield, Zap, ArrowRight, Github } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-zinc-100">
              MySciSpace
            </span>
          </Link>
          
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" className="text-zinc-400 hover:text-zinc-100">
                登录
              </Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-emerald-600 hover:bg-emerald-500 text-white">
                免费开始
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-8">
            <Sparkles className="w-4 h-4" />
            AI 驱动的论文阅读体验
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-zinc-100 mb-6">
            让 AI 成为你的
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
              论文阅读伙伴
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10">
            上传 PDF 论文，AI 自动生成结构化笔记，并支持基于论文内容的智能问答。
            让学术阅读更高效、更深入。
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="gap-2 h-12 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25">
                免费开始使用
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="https://github.com" target="_blank">
              <Button size="lg" variant="outline" className="gap-2 h-12 px-6 border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                <Github className="w-4 h-4" />
                查看源码
              </Button>
            </Link>
          </div>

          {/* Trust Badge */}
          <p className="mt-8 text-sm text-zinc-600">
            无需信用卡 • 免费使用 GPT-4o Mini
          </p>
        </div>

        {/* Hero Visual */}
        <div className="mt-20 max-w-5xl mx-auto">
          <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/50 p-2 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent rounded-2xl z-10" />
            <div className="aspect-[16/9] rounded-xl bg-zinc-900 flex items-center justify-center border border-zinc-800">
              {/* Mockup Content */}
              <div className="w-full h-full flex">
                {/* PDF Side */}
                <div className="flex-1 border-r border-zinc-800 p-6">
                  <div className="h-full rounded-lg bg-zinc-800/50 flex items-center justify-center">
                    <div className="text-center">
                      <BookOpen className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                      <p className="text-zinc-500">PDF 阅读器</p>
                    </div>
                  </div>
                </div>
                {/* AI Side */}
                <div className="w-80 p-6">
                  <div className="space-y-4">
                    <div className="h-8 w-32 rounded bg-zinc-800" />
                    <div className="space-y-2">
                      <div className="h-4 w-full rounded bg-zinc-800/50" />
                      <div className="h-4 w-3/4 rounded bg-zinc-800/50" />
                      <div className="h-4 w-5/6 rounded bg-zinc-800/50" />
                    </div>
                    <div className="pt-4 space-y-2">
                      <div className="h-4 w-full rounded bg-emerald-500/20" />
                      <div className="h-4 w-4/5 rounded bg-emerald-500/20" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-zinc-100 mb-4">
              为研究者打造的智能工具
            </h2>
            <p className="text-zinc-500 max-w-xl mx-auto">
              从上传到笔记，从问答到洞察，MySciSpace 让每一步都更简单
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={Upload}
              title="轻松上传"
              description="拖拽 PDF 即可上传，支持最大 50MB 的论文文件，自动提取元数据"
              color="emerald"
            />
            <FeatureCard
              icon={Sparkles}
              title="AI 结构化笔记"
              description="一键生成包含 TL;DR、创新点、方法、结果、局限性的完整笔记"
              color="violet"
            />
            <FeatureCard
              icon={MessageSquare}
              title="智能问答"
              description="针对论文内容提问，AI 基于上下文给出精准回答"
              color="blue"
            />
            <FeatureCard
              icon={Shield}
              title="数据安全"
              description="你的论文和笔记完全私有，基于 Supabase RLS 实现严格的访问控制"
              color="amber"
            />
            <FeatureCard
              icon={Zap}
              title="BYOK 模式"
              description="使用自己的 API Key 解锁 GPT-4o 等高级模型，更强大的分析能力"
              color="rose"
            />
            <FeatureCard
              icon={BookOpen}
              title="专注阅读"
              description="极简的 Split View 设计，左侧阅读论文，右侧查看笔记和对话"
              color="teal"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-cyan-500/20 blur-3xl" />
            <div className="relative bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 sm:p-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-zinc-100 mb-4">
                准备好提升阅读效率了吗?
              </h2>
              <p className="text-zinc-400 mb-8">
                加入 MySciSpace，让 AI 帮你更好地理解学术论文
              </p>
              <Link href="/signup">
                <Button size="lg" className="h-12 px-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25">
                  立即免费注册
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <BookOpen className="w-4 h-4" />
            <span className="text-sm">MySciSpace</span>
          </div>
          <p className="text-sm text-zinc-600">
            Built with Next.js, Supabase & Vercel AI SDK
          </p>
        </div>
      </footer>
    </div>
  )
}

interface FeatureCardProps {
  icon: React.ElementType
  title: string
  description: string
  color: 'emerald' | 'violet' | 'blue' | 'amber' | 'rose' | 'teal'
}

const colorClasses = {
  emerald: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-400',
  violet: 'from-violet-500/20 to-purple-500/20 border-violet-500/30 text-violet-400',
  blue: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-400',
  amber: 'from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-400',
  rose: 'from-rose-500/20 to-pink-500/20 border-rose-500/30 text-rose-400',
  teal: 'from-teal-500/20 to-emerald-500/20 border-teal-500/30 text-teal-400',
}

function FeatureCard({ icon: Icon, title, description, color }: FeatureCardProps) {
  return (
    <div className="group p-6 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorClasses[color].split(' ').slice(0, 2).join(' ')} border ${colorClasses[color].split(' ')[2]} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
        <Icon className={`w-6 h-6 ${colorClasses[color].split(' ').slice(-1)}`} />
      </div>
      <h3 className="font-semibold text-zinc-100 mb-2">{title}</h3>
      <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
    </div>
  )
}
