import type { Metadata, Viewport } from 'next';
import { CloseOutPhone } from '../../../components/close-out';

export const metadata: Metadata = { title: 'Close out · Covers' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function CloseOutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CloseOutPhone planId={decodeURIComponent(id)} />;
}
