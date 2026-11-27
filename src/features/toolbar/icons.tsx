import type { SVGProps } from 'react';

/** Custom SVG icons for data-structure-specific tools (Lucide covers the generic ones). */
type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </svg>
  );
}

export const NodeIcon = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="7" width="12" height="10" rx="1.5" />
    <line x1="9.5" y1="7" x2="9.5" y2="17" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    <path d="M12 12h9" />
    <path d="M18.5 9.5 21 12l-2.5 2.5" />
  </Svg>
);

export const ObjectIcon = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
    <line x1="4" y1="8" x2="20" y2="8" />
    <line x1="7" y1="12" x2="17" y2="12" />
    <line x1="7" y1="16" x2="14" y2="16" />
  </Svg>
);

export const VariableIcon = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="8" width="13" height="8" rx="4" />
    <path d="M6 12h5" />
    <circle cx="15.5" cy="12" r="1.2" fill="currentColor" />
    <path d="M16.5 12h5" />
    <path d="m19.5 10 2 2-2 2" />
  </Svg>
);

export const ReferenceIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="5" cy="17" r="2" />
    <path d="M7 16c4-1 6-5 10-9" />
    <path d="M13.5 6.5 17 7l-.5 3.5" />
    <rect x="17" y="3" width="4.5" height="4.5" rx="1" />
  </Svg>
);

export const NullIcon = (p: P) => (
  <Svg {...p}>
    <line x1="12" y1="3" x2="12" y2="11" />
    <line x1="5" y1="11" x2="19" y2="11" />
    <line x1="8" y1="15" x2="16" y2="15" />
    <line x1="10.5" y1="19" x2="13.5" y2="19" />
  </Svg>
);

export const ArrayIcon = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="8" width="20" height="8" rx="1" />
    <line x1="7" y1="8" x2="7" y2="16" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="17" y1="8" x2="17" y2="16" />
  </Svg>
);

export const MatrixIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
  </Svg>
);

export const ContainerIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 4v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4" />
    <rect x="7.5" y="14" width="9" height="3.5" rx="0.6" />
    <rect x="7.5" y="9" width="9" height="3.5" rx="0.6" />
  </Svg>
);

export const LoopIcon = (p: P) => (
  <Svg {...p}>
    <path d="M17 7a7 7 0 1 0 2 5" />
    <path d="M17 2.5V7h-4.5" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
  </Svg>
);

export const ConditionIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3 21 12 12 21 3 12Z" />
    <path d="M10 10.2a2 2 0 1 1 2.7 1.9c-.5.2-.7.6-.7 1v.4" />
    <circle cx="12" cy="16" r="0.6" fill="currentColor" />
  </Svg>
);

export const MethodIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 4C5.5 4 6 9 3.5 12 6 15 5.5 20 8 20" />
    <path d="M16 4c2.5 0 2 5 4.5 8-2.5 3-2 8-4.5 8" />
    <path d="M10 15.5 14 8.5" />
  </Svg>
);

export const FrameIcon = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="14" width="16" height="6" rx="1" />
    <rect x="5.5" y="8.5" width="13" height="5.5" rx="1" />
    <rect x="7" y="3.5" width="10" height="5" rx="1" strokeDasharray="2 1.6" />
  </Svg>
);

export const CheckpointIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 21V3.5" />
    <path d="M6 4h11l-2.5 3.5L17 11H6" />
  </Svg>
);
