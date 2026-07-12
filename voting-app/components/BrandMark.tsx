import Image from 'next/image';

/** Department-logo brand mark (replaces the old `>_` glyph tile). */
export default function BrandMark({ className = 'terminal-mark' }: { className?: string }) {
  return (
    <span className={`${className} has-logo`} aria-hidden="true">
      <Image src="/assets/department_logo.png" alt="" width={36} height={36} />
    </span>
  );
}
