'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Flag,
  Pause,
  Play,
  ShieldCheck,
  X,
} from 'lucide-react'
import { Monogram } from './monogram'
import { Button } from '@/components/ui/button'
import {
  categoryLabel,
  formatMoney,
  formatCompact,
  type CategoryId,
} from '@/lib/rankburn-data'
import { cn } from '@/lib/utils'

type CampaignStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'EXHAUSTED' | 'REJECTED'

type AdminCampaign = {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  category: CategoryId
  website: string
  hue: number
  budget: number
  burnRate: number
  totalSpend: number
  spentToday: number
  visitors: number
  impressions: number
  clicks: number
  joined: string
  status: CampaignStatus
  flagged: boolean
  flagReason?: string
  rejectionReason?: string
  submittedAt?: string
}

type AuditEntry = {
  id: string
  action: string
  entityLabel: string
  actorLabel: string
  reason?: string
  createdAt: string
}

type AdminSnapshot = {
  moderator: { id: string; email: string }
  overview: {
    totalActiveBudget: number
    spendToday: number
    activeAdvertisers: number
    activeCampaigns: number
    pendingReview: number
    pausedCampaigns: number
    flaggedCampaigns: number
    exhaustedCampaigns: number
    impressions: number
    visitors: number
    outboundClicks: number
    ctr: number
  }
  campaigns: AdminCampaign[]
  auditLogs: AuditEntry[]
}

type ModerationAction =
  | 'APPROVE'
  | 'REJECT'
  | 'FLAG'
  | 'UNFLAG'
  | 'PAUSE'
  | 'RESUME'

type AdminTab = 'queue' | 'live' | 'audit'

export function AdminPanel() {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<AdminTab>('queue')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<AdminCampaign | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/campaigns', { cache: 'no-store' })
      if (response.status === 401) {
        router.replace('/admin/login')
        return
      }
      if (!response.ok) {
        setError('Could not load moderation data.')
        return
      }
      setSnapshot((await response.json()) as AdminSnapshot)
      setError(null)
    } catch {
      setError('Could not reach the moderation service.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    load()
    const interval = setInterval(load, 20000)
    return () => clearInterval(interval)
  }, [load])

  const moderate = useCallback(
    async (campaignId: string, action: ModerationAction, reason?: string) => {
      setBusyId(campaignId)
      setError(null)
      try {
        const response = await fetch('/api/admin/moderation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId, action, reason }),
        })
        if (response.status === 401) {
          router.replace('/admin/login')
          return
        }
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string
          } | null
          setError(payload?.error ?? 'That action was rejected by the server.')
          return
        }
        await load()
      } catch {
        setError('Could not reach the moderation service.')
      } finally {
        setBusyId(null)
      }
    },
    [load, router],
  )

  const pending = useMemo(
    () => snapshot?.campaigns.filter((c) => c.status === 'PENDING') ?? [],
    [snapshot],
  )
  const live = useMemo(
    () =>
      snapshot?.campaigns.filter(
        (c) => c.status !== 'PENDING' && c.status !== 'REJECTED',
      ) ?? [],
    [snapshot],
  )

  if (loading) return <PanelSkeleton />

  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
        <p className="mt-3 text-sm font-medium text-destructive">
          {error ?? 'Moderation data is unavailable.'}
        </p>
        <Button variant="outline" onClick={load} className="mt-4">
          Retry
        </Button>
      </div>
    )
  }

  const { overview } = snapshot

  return (
    <div className="space-y-8">
      <section className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          label="Total active ad budget"
          value={formatMoney(overview.totalActiveBudget, 0)}
          sub="currently delivering exposure"
          accent
        />
        <Metric
          label="Advertising spend today"
          value={formatMoney(overview.spendToday, 0)}
          sub="budget used across campaigns"
        />
        <Metric
          label="Active advertisers"
          value={formatCompact(overview.activeAdvertisers)}
          sub={`${formatCompact(overview.activeCampaigns)} active campaigns`}
        />
        <Metric
          label="Pending review"
          value={formatCompact(overview.pendingReview)}
          sub="awaiting a moderation decision"
          warning={overview.pendingReview > 0}
        />
        <Metric
          label="Paused campaigns"
          value={formatCompact(overview.pausedCampaigns)}
          sub={`${formatCompact(overview.exhaustedCampaigns)} exhausted`}
        />
        <Metric
          label="Flagged campaigns"
          value={formatCompact(overview.flaggedCampaigns)}
          sub="flagged campaigns can still run"
          warning={overview.flaggedCampaigns > 0}
        />
        <Metric
          label="Visitors"
          value={formatCompact(overview.visitors)}
          sub={`${formatCompact(overview.impressions)} impressions`}
        />
        <Metric
          label="Outbound clicks"
          value={formatCompact(overview.outboundClicks)}
          sub="clicks never consume budget"
        />
        <Metric
          label="CTR"
          value={`${overview.ctr.toFixed(1)}%`}
          sub="outbound clicks / visitors"
        />
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
        <TabButton
          active={tab === 'queue'}
          onClick={() => setTab('queue')}
          label={`Review queue (${pending.length})`}
        />
        <TabButton
          active={tab === 'live'}
          onClick={() => setTab('live')}
          label="Live campaigns"
        />
        <TabButton
          active={tab === 'audit'}
          onClick={() => setTab('audit')}
          label="Audit log"
        />
      </div>

      {tab === 'queue' && (
        <section className="space-y-3">
          {pending.length === 0 ? (
            <EmptyState
              title="Review queue is clear"
              body="New campaign submissions appear here before they can enter the live ranking."
            />
          ) : (
            pending.map((campaign) => (
              <ReviewCard
                key={campaign.id}
                campaign={campaign}
                busy={busyId === campaign.id}
                expanded={expandedId === campaign.id}
                onToggleView={() =>
                  setExpandedId((current) =>
                    current === campaign.id ? null : campaign.id,
                  )
                }
                onApprove={() => moderate(campaign.id, 'APPROVE')}
                onReject={() => setRejecting(campaign)}
              />
            ))
          )}
        </section>
      )}

      {tab === 'live' && (
        <LiveModerationTable
          campaigns={live}
          busyId={busyId}
          expandedId={expandedId}
          onToggleView={(id) =>
            setExpandedId((current) => (current === id ? null : id))
          }
          onModerate={moderate}
        />
      )}

      {tab === 'audit' && <AuditLog entries={snapshot.auditLogs} />}

      {rejecting && (
        <RejectDialog
          campaign={rejecting}
          onCancel={() => setRejecting(null)}
          onConfirm={async (reason) => {
            const target = rejecting
            setRejecting(null)
            await moderate(target.id, 'REJECT', reason)
          }}
        />
      )}
    </div>
  )
}

function PanelSkeleton() {
  return (
    <div
      className="space-y-8"
      aria-busy="true"
      aria-label="Loading moderation data"
    >
      <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className="bg-card p-5">
            <div className="h-3 w-24 rounded bg-surface-3" />
            <div className="mt-3 h-7 w-20 rounded bg-surface-3" />
            <div className="mt-2 h-3 w-32 rounded bg-surface-2" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-28 rounded-2xl border border-border bg-card"
          />
        ))}
      </div>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-12 text-center">
      <ShieldCheck className="mx-auto h-6 w-6 text-primary" />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative shrink-0 px-4 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
      )}
    </button>
  )
}

function DetailLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
      {children}
    </span>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <DetailLabel>{label}</DetailLabel>
      <p className="mt-1 font-medium tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function CampaignDetail({ campaign }: { campaign: AdminCampaign }) {
  return (
    <div className="mt-4 grid gap-4 rounded-xl border border-border bg-background/40 p-4 text-sm sm:grid-cols-2">
      <div className="sm:col-span-2">
        <DetailLabel>Description</DetailLabel>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          {campaign.description}
        </p>
      </div>
      <Detail label="Website" value={campaign.website} />
      <Detail label="Category" value={categoryLabel(campaign.category)} />
      <Detail
        label="Active advertising budget"
        value={formatMoney(campaign.budget)}
      />
      <Detail label="Used today" value={formatMoney(campaign.spentToday)} />
      <Detail
        label="Lifetime used"
        value={formatMoney(campaign.totalSpend, 0)}
      />
      <Detail
        label="Burn rate"
        value={`${formatMoney(campaign.burnRate)}/hour`}
      />
      <Detail label="Impressions" value={formatCompact(campaign.impressions)} />
      <Detail label="Outbound clicks" value={formatCompact(campaign.clicks)} />
      <Detail
        label="Submitted"
        value={
          campaign.submittedAt
            ? new Date(campaign.submittedAt).toLocaleString()
            : '\u2014'
        }
      />
      <Detail label="Status" value={campaign.status} />
      {campaign.flagReason && (
        <div className="sm:col-span-2">
          <DetailLabel>Flag reason</DetailLabel>
          <p className="mt-1 text-destructive">{campaign.flagReason}</p>
        </div>
      )}
      {campaign.rejectionReason && (
        <div className="sm:col-span-2">
          <DetailLabel>Rejection reason</DetailLabel>
          <p className="mt-1 text-destructive">{campaign.rejectionReason}</p>
        </div>
      )}
    </div>
  )
}

function IconAction({
  onClick,
  icon,
  label,
  active,
  disabled,
  tone = 'primary',
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  tone?: 'primary' | 'destructive'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={label}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        active && tone === 'destructive'
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : active
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function CampaignStatusBadge({
  status,
  flagged,
}: {
  status: CampaignStatus
  flagged: boolean
}) {
  // FLAGGED and PAUSED are independent: a flagged campaign keeps running
  // unless a moderator also pauses it.
  const badge =
    status === 'PAUSED' ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2 py-1 text-xs text-muted-foreground">
        <Pause className="h-3 w-3" /> Paused
      </span>
    ) : status === 'EXHAUSTED' ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2 py-1 text-xs text-muted-foreground">
        Exhausted
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-xs text-primary">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Live
      </span>
    )

  if (!flagged) return badge

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {badge}
      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
        <AlertTriangle className="h-3 w-3" /> Flagged
      </span>
    </div>
  )
}

function LiveModerationTable({
  campaigns,
  busyId,
  expandedId,
  onToggleView,
  onModerate,
}: {
  campaigns: AdminCampaign[]
  busyId: string | null
  expandedId: string | null
  onToggleView: (id: string) => void
  onModerate: (
    campaignId: string,
    action: ModerationAction,
    reason?: string,
  ) => void
}) {
  if (campaigns.length === 0) {
    return (
      <EmptyState
        title="No live campaigns"
        body="Approved campaigns with confirmed advertising budget appear here."
      />
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border">
      <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-border bg-card px-4 py-2.5 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground lg:grid-cols-[1fr_110px_120px_150px_260px]">
        <span>Campaign</span>
        <span className="hidden text-right lg:block">Budget</span>
        <span className="hidden text-right lg:block">Used today</span>
        <span className="hidden lg:block">Status</span>
        <span className="text-right">Moderation</span>
      </div>
      <div className="divide-y divide-border">
        {campaigns.map((campaign) => {
          const isPaused = campaign.status === 'PAUSED'
          const isFlagged = campaign.flagged
          const busy = busyId === campaign.id
          const expanded = expandedId === campaign.id

          return (
            <div
              key={campaign.id}
              className={cn(
                'px-4 py-3 transition-colors',
                isPaused && 'bg-secondary/20',
                isFlagged && !isPaused && 'bg-destructive/[0.035]',
                busy && 'opacity-60',
              )}
            >
              <div className="grid grid-cols-[1fr_auto] items-center gap-4 lg:grid-cols-[1fr_110px_120px_150px_260px]">
                <div className="flex min-w-0 items-center gap-3">
                  <Monogram name={campaign.name} hue={campaign.hue} size={36} />
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {campaign.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {categoryLabel(campaign.category)} · {campaign.website}
                    </span>
                  </div>
                </div>

                <span className="hidden text-right text-sm tabular-nums lg:block">
                  {formatMoney(campaign.budget)}
                </span>
                <span className="hidden text-right text-sm tabular-nums text-muted-foreground lg:block">
                  {formatMoney(campaign.spentToday)}
                </span>
                <div className="hidden lg:block">
                  <CampaignStatusBadge
                    status={campaign.status}
                    flagged={isFlagged}
                  />
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <IconAction
                    onClick={() => onToggleView(campaign.id)}
                    active={expanded}
                    label="View"
                    icon={
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 transition-transform',
                          expanded && 'rotate-180',
                        )}
                      />
                    }
                  />
                  <IconAction
                    onClick={() =>
                      onModerate(
                        campaign.id,
                        isFlagged ? 'UNFLAG' : 'FLAG',
                        isFlagged ? undefined : 'Manual review requested',
                      )
                    }
                    disabled={busy}
                    active={isFlagged}
                    tone="destructive"
                    label={isFlagged ? 'Unflag' : 'Flag'}
                    icon={<Flag className="h-3.5 w-3.5" />}
                  />
                  <IconAction
                    onClick={() =>
                      onModerate(campaign.id, isPaused ? 'RESUME' : 'PAUSE')
                    }
                    disabled={busy}
                    active={isPaused}
                    label={isPaused ? 'Resume' : 'Pause'}
                    icon={
                      isPaused ? (
                        <Play className="h-3.5 w-3.5" />
                      ) : (
                        <Pause className="h-3.5 w-3.5" />
                      )
                    }
                  />
                </div>
              </div>

              {expanded && <CampaignDetail campaign={campaign} />}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function AuditLog({ entries }: { entries: AuditEntry[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-5">
        <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Audit log
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Every moderation decision, with the campaign, timestamp, moderator and
          reason.
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No recorded events yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 py-3 text-sm">
              <span
                className={cn(
                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                  entry.action === 'REJECT' || entry.action === 'FLAG'
                    ? 'bg-destructive'
                    : 'bg-primary/70',
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-xs uppercase tracking-wide text-primary">
                    {entry.action}
                  </span>
                  <span className="font-medium text-foreground">
                    {entry.entityLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  by {entry.actorLabel}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ReviewCard({
  campaign,
  busy,
  expanded,
  onToggleView,
  onApprove,
  onReject,
}: {
  campaign: AdminCampaign
  busy: boolean
  expanded: boolean
  onToggleView: () => void
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card p-5 transition-all duration-300',
        busy && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <Monogram name={campaign.name} hue={campaign.hue} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{campaign.name}</h3>
            <span className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-xs font-medium text-foreground">
              Awaiting review
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {campaign.website} · {categoryLabel(campaign.category)} ·{' '}
            {formatMoney(campaign.budget, 0)} advertising budget
          </p>
          <p className="mt-2 text-sm text-foreground/90">{campaign.tagline}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={onToggleView}>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                expanded && 'rotate-180',
              )}
            />
            View
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onReject}
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
            Reject
          </Button>
          <Button size="sm" disabled={busy} onClick={onApprove}>
            <Check className="h-4 w-4" />
            Approve
          </Button>
        </div>
      </div>

      {expanded && <CampaignDetail campaign={campaign} />}
    </div>
  )
}

/**
 * Rejection always requires a reason. The server enforces this too - this
 * dialog exists so the moderator is asked before the request is sent.
 */
function RejectDialog({
  campaign,
  onCancel,
  onConfirm,
}: {
  campaign: AdminCampaign
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const valid = reason.trim().length >= 4

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Reject ${campaign.name}`}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h3 className="text-lg font-semibold">Reject {campaign.name}?</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          A reason is required. It is written to the audit log alongside the
          campaign, the timestamp and your account.
        </p>

        <label
          htmlFor="reject-reason"
          className="mt-5 block font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground"
        >
          Reason
        </label>
        <textarea
          id="reject-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          placeholder="e.g. Landing page does not match the submitted category"
          className="mt-2 w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none ring-primary/40 placeholder:text-muted-foreground/60 focus:ring-2"
        />

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => onConfirm(reason.trim())}
            className="border-destructive/30 bg-destructive/15 text-destructive hover:bg-destructive/25"
          >
            Reject campaign
          </Button>
        </div>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  sub,
  accent,
  warning,
}: {
  label: string
  value: string
  sub: string
  accent?: boolean
  warning?: boolean
}) {
  return (
    <div className="bg-card p-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-2 text-2xl font-semibold tabular-nums tracking-tight',
          accent && 'text-primary',
          warning && 'text-destructive',
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}
