import localFont from 'next/font/local';
import SuperAdminDesignTest from '@/components/admin/SuperAdminDesignTest';

const figtree = localFont({
  src: '../../fonts/figtree-latin.woff2',
  weight: '300 900',
  display: 'swap',
});

const jetBrainsMono = localFont({
  src: '../../fonts/jetbrains-mono-latin.woff2',
  weight: '400 600',
  display: 'swap',
});

export default function SuperAdminDesignTestRoute() {
  return (
    <SuperAdminDesignTest
      fonts={{
        figtree: figtree.style.fontFamily,
        jetBrainsMono: jetBrainsMono.style.fontFamily,
      }}
    />
  );
}
