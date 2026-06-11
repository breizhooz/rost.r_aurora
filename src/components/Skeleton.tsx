interface SkeletonProps {
  width?: string;
  height?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = '16px', style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      aria-hidden="true"
      style={{ width, height, borderRadius: 6, ...style }}
    />
  );
}

export function SkeletonRecipeCard() {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-card)',
      borderRadius: 'var(--radius)',
      padding: '1.25rem',
      minWidth: 220,
      flexShrink: 0,
    }}>
      <Skeleton height="12px" width="50%" style={{ marginBottom: 10 }} />
      <Skeleton height="22px" width="85%" style={{ marginBottom: 8 }} />
      <Skeleton height="12px" width="65%" style={{ marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Skeleton height="24px" width="60px" style={{ borderRadius: 20 }} />
        <Skeleton height="24px" width="70px" style={{ borderRadius: 20 }} />
      </div>
    </div>
  );
}

export function SkeletonProfileCard() {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-card)',
      borderRadius: 'var(--radius)',
      padding: '2rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <Skeleton width="64px" height="64px" style={{ borderRadius: '50%' }} />
        <div style={{ flex: 1 }}>
          <Skeleton height="16px" width="60%" style={{ marginBottom: 8 }} />
          <Skeleton height="12px" width="40%" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {[1, 2, 3].map((i) => (
          <div key={i}>
            <Skeleton height="10px" width="50%" style={{ marginBottom: 6 }} />
            <Skeleton height="20px" width="70%" />
          </div>
        ))}
      </div>
    </div>
  );
}
