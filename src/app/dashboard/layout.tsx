import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { DashboardNav } from '@/components/dashboard/nav'
import { Toaster } from '@/components/ui/sonner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <DashboardNav user={user} />
      <main className="pt-16">
        {children}
      </main>
      <Toaster richColors position="bottom-right" />
    </div>
  )
}
