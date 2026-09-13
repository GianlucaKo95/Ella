export function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl?: string | null; size?: number }) {
  const style = size ? { width: size, height: size, fontSize: size * 0.42 } : undefined;
  if (avatarUrl) {
    return <img className="avatar" src={avatarUrl} alt={name} style={style} />;
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="avatar avatar-fallback" style={style} aria-label={name}>
      {initial}
    </div>
  );
}
