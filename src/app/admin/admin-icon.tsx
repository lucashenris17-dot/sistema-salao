import type { ReactNode } from 'react';

const icons: Record<string, ReactNode> = {
  home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18m-13 5 2 2 5-4" /></>,
  inbox: <><path d="M4 4h16l2 11v5H2v-5L4 4Z" /><path d="M2 15h6l2 3h4l2-3h6M8 8h8M9 11h6" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 4a4 4 0 0 1 0 8m3 9v-2a7 7 0 0 0-3-5" /></>,
  scissors: <><circle cx="5" cy="6" r="3" /><circle cx="5" cy="18" r="3" /><path d="m8 8 13 13M8 16 21 3M14 10l-2 2" /></>,
  block: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18m-12 3 6 4m0-4-6 4" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 12-12" />,
  logout: <path d="M9 3H4v18h5m0-9h12m-4-4 4 4-4 4" />,
};

export function AdminIcon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      {icons[name] || icons.calendar}
    </svg>
  );
}
