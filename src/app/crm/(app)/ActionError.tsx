/* Renders the ?error= message a failed server action bounced back with. */
export default function ActionError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div className="action-err" role="alert">
      <b>THAT DID NOT SAVE</b> {error}
    </div>
  );
}
