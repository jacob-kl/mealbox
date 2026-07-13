function polarPoint(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wedgePath(cx, cy, r, startAngle, endAngle) {
  const start = polarPoint(cx, cy, r, endAngle);
  const end = polarPoint(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

/**
 * A small circle divided into `count` equal wedges — a quick, at-a-glance
 * "grab this many" indicator for shopping list items that come in discrete
 * units (cans, bunches, whole produce), instead of a bare number.
 */
export default function PackCircle({ count = 1, size = 28 }) {
  const clamped = Math.max(1, Math.min(count, 8)); // cap the wedge drawing; the number label still shows the true count
  const r = size / 2 - 1.5;
  const cx = size / 2;
  const cy = size / 2;
  const wedgeAngle = 360 / clamped;

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--color-line))" strokeWidth="1.5" />
        {Array.from({ length: clamped }, (_, i) => (
          <path
            key={i}
            d={wedgePath(cx, cy, r, i * wedgeAngle, (i + 1) * wedgeAngle)}
            fill={i % 2 === 0 ? 'rgb(var(--color-rust))' : 'rgb(var(--color-gold))'}
            stroke="rgb(var(--color-paper))"
            strokeWidth="1"
          />
        ))}
      </svg>
      <span className="font-mono text-xs text-ink/70">×{count}</span>
    </span>
  );
}
