export type Notice = { text: string; error?: boolean } | null;

/** Success/error feedback line; errors get alert semantics + rose styling. */
export default function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p className={`form-message${notice.error ? ' is-error' : ''}`} role={notice.error ? 'alert' : 'status'}>
      {notice.text}
    </p>
  );
}
