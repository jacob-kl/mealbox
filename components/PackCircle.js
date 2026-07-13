function polarPoint(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wedgePath(cx, cy, r, startAngle, endAngle) {
  if (endAngle - startAngle >= 359.99) {
    // A full circle can't be drawn as a single arc path (start === end) —
    // draw it as two half-circle arcs instead.
    const top = polarPoint(cx, cy, r, startAngle);
    const bottom = polarPoint(cx, cy, r, startAngle + 180);
    return `M ${top.x} ${top.y} A ${r} ${r} 0 1 1 ${bottom.x} ${bottom.y} A ${r} ${r} 0 1 1 ${top.x} ${top.y} Z`;
  }
  const start = polarPoint(cx, cy, r, endAngle);
  const end = polarPoint(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

/**
 * A circle divided into `total` equal wedges, `filled` of them colored in —
 * click it to fill one more wedge at a time (wrapping back to 0 after the
 * last), so "need 11 carrots" becomes tap-tap-tap-tap-tap and the circle
 * shows exactly how many are left, no mental math required.
 */
export default function PackCircle({ filled = 0, total = 1, onClick, size = 32 }) {
  const drawnTotal = Math.max(1, Math.min(total, 8)); // cap wedge drawing; label still shows the true count
  const drawnFilled = Math.round((filled / total) * drawnTotal);
  const r = size / 2 - 1.5;
  const cx = size / 2;
  const cy = size / 2;
  const wedgeAngle = 360 / drawnTotal;

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 shrink-0 group"
      title={`${filled} of ${total} — tap to update`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="group-active:scale-90 transition-transform">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgb(var(--color-line))" strokeWidth="1.5" />
        {Array.from({ length: drawnTotal }, (_, i) => (
          <path
            key={i}
            d={wedgePath(cx, cy, r, i * wedgeAngle, (i + 1) * wedgeAngle)}
            fill={i < drawnFilled ? 'rgb(var(--color-pine))' : 'rgb(var(--color-paper))'}
            stroke="rgb(var(--color-paper))"
            strokeWidth="1"
          />
        ))}
      </svg>
      <span className="font-mono text-xs text-ink/70">
        {filled}/{total}
      </span>
    </button>
  );
}
