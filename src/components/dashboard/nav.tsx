'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BookOpen, FileText, Settings, LogOut, Home } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface DashboardNavProps {
  user: User
}

const navItems = [
  { href: '/dashboard', label: '论文库', icon: Home },
]

export function DashboardNav({ user }: DashboardNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    toast.success('已退出登录')
    router.push('/')
    router.refresh()
  }

  const initials = user.email?.slice(0, 2).toUpperCase() || 'U'

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-zinc-100">
            MySciSpace
          </span>
        </Link>

        {/* Nav Items */}
        <div className="hidden sm:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'gap-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50',
                    isActive && 'text-zinc-100 bg-zinc-800/50'
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Button>
              </Link>
            )
          })}
        </div>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9 border border-zinc-700">
                <AvatarImage src={user.user_metadata?.avatar_url} alt={user.email || ''} />
                <AvatarFallback className="bg-zinc-800 text-zinc-300 text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-zinc-900 border-zinc-800" align="end">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium text-zinc-100">
                  {user.user_metadata?.full_name || '用户'}
                </p>
                <p className="text-xs text-zinc-500 truncate">
                  {user.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem asChild>
              <Link href="/dashboard" className="cursor-pointer text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100">
                <FileText className="mr-2 h-4 w-4" />
                我的论文
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" className="cursor-pointer text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100">
                <Settings className="mr-2 h-4 w-4" />
                设置
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-800" />
            <DropdownMenuItem 
              onClick={handleSignOut}
              className="cursor-pointer text-red-400 focus:bg-zinc-800 focus:text-red-400"
            >
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  )
}
