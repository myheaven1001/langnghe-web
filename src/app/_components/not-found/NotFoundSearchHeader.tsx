'use client';

import { useRouter } from 'next/navigation';
import { PublicHeader } from '@/components/ui';

// Wraps PublicHeader with a real onSearch handler. Needs its own 'use
// client' wrapper because not-found.tsx itself stays a Server Component
// (it exports `metadata`, which client components can't do) but functions
// like onSearch can't cross the server→client boundary as plain props.
export function NotFoundSearchHeader() {
  const router = useRouter();

  return (
    <PublicHeader
      showTopbar={false}
      searchPlaceholder="Tìm sản phẩm, nhà cung cấp..."
      onSearch={(query) => {
        if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      }}
    />
  );
}
