'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function AdminLoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        setError(payload?.error ?? 'Sign in failed')
        return
      }
      router.replace('/admin')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-8 space-y-4">
      <div>
        <label
          htmlFor="admin-email"
          className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground"
        >
          Email
        </label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none ring-primary/40 placeholder:text-muted-foreground/60 focus:ring-2"
          placeholder="you@company.com"
        />
      </div>

      <div>
        <label
          htmlFor="admin-password"
          className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground"
        >
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !pending) submit()
          }}
          className="mt-2 w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none ring-primary/40 focus:ring-2"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <Button
        onClick={submit}
        disabled={pending || email.length === 0 || password.length === 0}
        className="h-10 w-full font-semibold"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </div>
  )
}
