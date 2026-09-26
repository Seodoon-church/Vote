'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

interface AuthState {
  user: User | null
  /** users/{uid}.role (한글 역할) */
  role: string | null
  isAdmin: boolean
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const ADMIN_ROLES = ['최고관리자', '관리자']

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)
      if (nextUser) {
        const snap = await getDoc(doc(db, 'users', nextUser.uid))
        setRole(snap.exists() ? (snap.get('role') as string) : null)
      } else {
        setRole(null)
      }
      setLoading(false)
    })
  }, [])

  const login = async (username: string, password: string) => {
    // 기존 시스템 관례: 이름만 입력하면 @seodoon.org 이메일로 변환
    const email = username.includes('@') ? username : `${username}@seodoon.org`
    await signInWithEmailAndPassword(auth, email, password)
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider
      value={{ user, role, isAdmin: role !== null && ADMIN_ROLES.includes(role), loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다')
  return ctx
}
