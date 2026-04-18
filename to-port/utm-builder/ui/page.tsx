import { requireAdmin } from '@/lib/auth'
import UTMBuilderClient from './UTMBuilderClient'

export default async function UTMBuilderPage() {
  await requireAdmin()
  return <UTMBuilderClient />
}
