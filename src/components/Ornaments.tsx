/** Vierpuntige ster (✦) zoals in de krantenstijl. */
export function Star({ className = "star", title }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <path d="M12 0c.9 6.6 4.8 10.6 12 12-7.2 1.4-11.1 5.4-12 12-.9-6.6-4.8-10.6-12-12C7.2 10.6 11.1 6.6 12 0z" fill="currentColor" />
    </svg>
  );
}

export function Stars({ n = 3 }: { n?: number }) {
  return (
    <span className="stars" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <Star key={i} />
      ))}
    </span>
  );
}
