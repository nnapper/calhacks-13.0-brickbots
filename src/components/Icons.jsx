const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true };

export const ChevronIcon = ({ dir = "left" }) => (
  <svg {...base} style={{ transform: dir === "right" ? "scaleX(-1)" : undefined }}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
export const SunIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
export const MoonIcon = () => (
  <svg {...base}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
  </svg>
);
export const SearchIcon = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const CheckIcon = () => (
  <svg {...base} strokeWidth={2.5}>
    <path d="M5 12.5 10 17 19 7" />
  </svg>
);
export const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 4v16l13-8z" />
  </svg>
);
