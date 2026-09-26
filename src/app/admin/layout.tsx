'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, role, loading, login, logout } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-slate-400">로딩 중…</div>
  }

  if (!user) {
    const handleLogin = async (e: FormEvent) => {
      e.preventDefault()
      setError('')
      setSubmitting(true)
      try {
        await login(username, password)
      } catch {
        setError('로그인에 실패했습니다. 이름(또는 이메일)과 비밀번호를 확인해 주세요.')
      } finally {
        setSubmitting(false)
      }
    }
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm border border-slate-200"
        >
          <h1 className="text-lg font-bold mb-1">선거 관리 로그인</h1>
          <p className="text-xs text-slate-500 mb-5">
            교회 관리자 또는 선거관리위원 계정으로 로그인하세요.
          </p>
          <input
            className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            placeholder="이름 또는 이메일"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
          <button
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-white text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50"
          >
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>
      </main>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
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
