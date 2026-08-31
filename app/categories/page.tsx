import { CategoryGrid } from '@/components/market/category-grid'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

export const metadata = {
  title: 'Categories — RankBurn',
  description: 'Every live advertising category on RankBurn, and who is leading each one right now.',
}

export default function CategoriesPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <header className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Markets
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Every category is its own live advertising market. Pick a category
              to see which products currently hold the most visibility.
            </p>
          </header>
          <CategoryGrid />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
