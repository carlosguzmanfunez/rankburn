import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { RankingBoard } from '@/components/market/ranking-board'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { CATEGORIES, categoryLabel, type CategoryId } from '@/lib/rankburn-data'

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ id: c.id }))
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const category = CATEGORIES.find((c) => c.id === id)
  if (!category) return notFound()

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <Link
            href="/categories"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All markets
          </Link>
          <header className="mb-8">
            <p className="text-xs uppercase tracking-widest text-primary">
              Market
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {categoryLabel(id as CategoryId)}
            </h1>
            <p className="mt-2 text-muted-foreground">
              Ranked by active advertising budget, updating live.
            </p>
          </header>
          <RankingBoard lockedCategory={id as CategoryId} />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
