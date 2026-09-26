'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { LoginForm } from '@/components/LoginForm'

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, role, loading, logout } = useAuth()

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-slate-400">로딩 중…</div>
  }

  if (!user) {
    return (
      <LoginForm
        title="선거 관리 로그인"
        description="교회 관리자 또는 선거관리위원 계정으로 로그인하세요."
      />
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="font-bold">
            🗳️ 선거 관리
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              {user.displayName || user.email}
              {role ? ` · ${role}` : ''}
            </span>
            <button onClick={logout} className="text-slate-400 hover:text-slate-700">
              로그아웃
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  )
}
