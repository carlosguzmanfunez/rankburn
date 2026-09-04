'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Mode = 'signin' | 'register'

/**
 * Advertiser sign-in and registration.
 *
 * The form never receives or stores a token: the session is set as an httpOnly
 * cookie by the server, which is why there is no "remember me" state, no
 * localStorage, and nothing here that identifies the user afterwards. Identity
 * is re-read from the server on every request.
 */
export function AdvertiserAuthForm() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setPending(true)
    setError(null)

    try {
      const endpoint =
        mode === 'signin' ? '/api/auth/session' : '/api/auth/register'

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'signin'
            ? { email, password }
            : { email, password, displayName },
        ),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        setError(payload?.error ?? 'Something went wrong. Try again.')
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Could not reach the server. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-4">
      <div className="inline-flex self-start rounded-lg border border-border bg-surface-1 p-0.5">
        {(['signin', 'register'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setMode(option)
              setError(null)
            }}
            className={
              mode === option
                ? 'rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground'
                : 'rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground'
            }
          >
            {option === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      {mode === 'register' && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Name</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground"
            placeholder="Your name or company"
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Email</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground"
          placeholder="you@company.com"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Password
        </span>
        <input
          type="password"
          autoComplete={
            mode === 'signin' ? 'current-password' : 'new-password'
          }
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground"
          placeholder={mode === 'register' ? 'At least 10 characters' : ''}
        />
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={pending || !email || !password}
        className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {pending
          ? 'Working…'
          : mode === 'signin'
            ? 'Sign in'
            : 'Create account'}
      </button>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
