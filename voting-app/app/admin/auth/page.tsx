import localFont from 'next/font/local';
import AdminAuthForm from '@/components/admin/AdminAuthForm';

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

export default function AdminAuthPage() {
  return (
    <AdminAuthForm
      fonts={{
        figtree: figtree.style.fontFamily,
        jetBrainsMono: jetBrainsMono.style.fontFamily,
      }}
    />
  );
}
