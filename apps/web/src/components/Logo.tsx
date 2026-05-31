// The CollabDocs logo mark: a rounded gradient badge containing document
// lines and a small collaboration cursor. Pure SVG, so it stays crisp at
// any size. Pass `size` to scale it (default 32px).

export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="CollabDocs logo"
    >
      <defs>
        <linearGradient id="cd-grad" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>

      {/* rounded badge */}
      <rect width="32" height="32" rx="9" fill="url(#cd-grad)" />

      {/* document text lines */}
      <rect x="8" y="9" width="13" height="2.4" rx="1.2" fill="white" opacity="0.95" />
      <rect x="8" y="14" width="16" height="2.4" rx="1.2" fill="white" opacity="0.7" />
      <rect x="8" y="19" width="9" height="2.4" rx="1.2" fill="white" opacity="0.5" />

      {/* collaboration cursor */}
      <path
        d="M20 18.5l6 2.4-2.5 1 1.2 2.6-1.5.7-1.2-2.6-2 1.7z"
        fill="white"
      />
    </svg>
  );
}
