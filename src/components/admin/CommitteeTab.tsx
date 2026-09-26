'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  addCommittee,
  listCommittees,
  removeCommittee,
  searchUsersByName,
} from '@/services/electionService'
import type { CommitteeMember, CommitteeRole } from '@/types/election'

const ROLE_LABELS: Record<CommitteeRole, string> = {
  chairman: '위원장',
  secretary: '서기',
  member: '위원',
  observer: '참관인',
}

export function CommitteeTab({ electionId }: { electionId: string }) {
  const [committees, setCommittees] = useState<(CommitteeMember & { id: string })[]>([])
  const [searchName, setSearchName] = useState('')
  const [results, setResults] = useState<{ uid: string; name: string; role?: string }[]>([])
  const [selectedRole, setSelectedRole] = useState<CommitteeRole>('member')
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      setCommittees(await listCommittees(electionId))
    } catch {
      setError('선관위 목록을 불러오지 못했습니다 (관리자/선관위 권한 필요).')
    }
  }, [electionId])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleSearch = async () => {
    if (!searchName.trim()) return
    setResults(await searchUsersByName(searchName.trim()))
  }

  const handleAppoint = async (user: { uid: string; name: string }) => {
    if (committees.length >= 7 && !confirm('규정(제2조)상 선관위는 7인 이내입니다. 계속할까요?'))
      return
    await addCommittee(electionId, user.uid, {
      member_id: '',
      name: user.name,
      role: selectedRole,
    })
    setResults([])
    setSearchName('')
    await reload()
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold">선거관리위원회</h2>
        <p className="mb-4 text-xs text-slate-500">
          규정 제2조: 당회원 7인 이내, 후보자의 가족·직계 존비속 제외. 위원장·서기는 호선.
        </p>
        {committees.length === 0 ? (
          <p className="text-sm text-slate-400">임명된 위원이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {committees.map((committee) => (
              <li key={committee.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-medium">{committee.name}</span>
                  <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {ROLE_LABELS[committee.role]}
                  </span>
                </span>
                <button
                  onClick={async () => {
                    if (confirm(`${committee.name} 위원을 해임할까요?`)) {
                      await removeCommittee(electionId, committee.id)
                      await reload()
                    }
                  }}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  해임
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold">위원 임명 (계정 검색)</h2>
        <div className="mb-3 flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="이름으로 계정 검색"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
          />
          <select
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as CommitteeRole)}
          >
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            onClick={handleSearch}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            검색
          </button>
        </div>
        {results.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {results.map((user) => (
              <li key={user.uid} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  {user.name}
                  {user.role && <span className="ml-2 text-xs text-slate-400">{user.role}</span>}
                </span>
                <button
                  onClick={() => handleAppoint(user)}
                  className="text-xs font-medium text-slate-700 hover:underline"
                >
                  {ROLE_LABELS[selectedRole]}(으)로 임명
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
