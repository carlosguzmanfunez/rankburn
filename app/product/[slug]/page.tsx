import { ProductDetail } from '@/components/market/product-detail'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { COMPANIES } from '@/lib/rankburn-data'

export function generateStaticParams() {
  return COMPANIES.map((c) => ({ slug: c.slug }))
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <ProductDetail slug={slug} />
      </main>
      <SiteFooter />
    </div>
  )
}
