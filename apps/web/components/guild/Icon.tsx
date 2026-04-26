import type { SVGProps } from "react";

export type IconName =
  | "scroll"
  | "shield"
  | "feather"
  | "compass"
  | "book"
  | "key"
  | "lantern"
  | "anvil"
  | "quill"
  | "hourglass"
  | "search"
  | "plus"
  | "chevron-right"
  | "chevron-down"
  | "chevron-left"
  | "send"
  | "menu"
  | "x"
  | "folder"
  | "file"
  | "users"
  | "user"
  | "tag"
  | "settings"
  | "bell"
  | "moon"
  | "sun"
  | "git-branch"
  | "play"
  | "pause"
  | "edit"
  | "copy"
  | "external"
  | "filter"
  | "circle"
  | "checkmark"
  | "calendar"
  | "tower"
  | "rune"
  | "map";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

const PATHS: Record<IconName, React.ReactNode> = {
  scroll: (
    <>
      <path d="M6 3 H17 a3 3 0 0 1 3 3 v12 a3 3 0 0 0 3 3 H7 a3 3 0 0 1-3-3 V6 a3 3 0 0 1 2-3z" />
      <path d="M9 8 H17 M9 12 H17 M9 16 H14" />
    </>
  ),
  shield: <path d="M12 3 L20 6 V12 a8 8 0 0 1-8 8 a8 8 0 0 1-8-8 V6 z" />,
  feather: (
    <>
      <path d="M20 4 L12 12 v8 h8 a8 8 0 0 0-2-16 z" />
      <path d="M16 8 L4 20" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.5 L11 13 L9.5 14.5 L13 11 z" />
    </>
  ),
  book: (
    <>
      <path d="M4 5 a2 2 0 0 1 2-2 h12 v18 H6 a2 2 0 0 1-2-2 z" />
      <path d="M4 19 a2 2 0 0 1 2-2 h12" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12 L20 3 M16 7 L19 10 M14 9 L17 12" />
    </>
  ),
  lantern: (
    <>
      <path d="M12 3 v2 M9 5 h6 M8 7 h8 v10 a4 4 0 0 1-4 4 a4 4 0 0 1-4-4 z" />
      <path d="M12 12 v4" />
    </>
  ),
  anvil: (
    <>
      <path d="M3 9 H17 V11 a4 4 0 0 1-4 4 H7 z" />
      <path d="M9 15 v3 H6 v3 H18 V18 H15 v-3" />
    </>
  ),
  quill: <path d="M3 21 L8 16 M9 15 L21 3 L18 9 L15 12 L12 15 z" />,
  hourglass: (
    <path d="M6 3 H18 M6 21 H18 M7 3 V7 a5 5 0 0 0 5 5 a5 5 0 0 0 5-5 V3 M7 21 V17 a5 5 0 0 1 5-5 a5 5 0 0 1 5 5 V21" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 L21 21" />
    </>
  ),
  plus: <path d="M12 5 V19 M5 12 H19" />,
  "chevron-right": <path d="M9 6 L15 12 L9 18" />,
  "chevron-down": <path d="M6 9 L12 15 L18 9" />,
  "chevron-left": <path d="M15 6 L9 12 L15 18" />,
  send: <path d="M21 3 L3 11 L11 14 L14 21 z" />,
  menu: <path d="M4 7 H20 M4 12 H20 M4 17 H20" />,
  x: <path d="M6 6 L18 18 M18 6 L6 18" />,
  folder: <path d="M3 7 a2 2 0 0 1 2-2 h4 l2 2 h8 a2 2 0 0 1 2 2 v8 a2 2 0 0 1-2 2 H5 a2 2 0 0 1-2-2 z" />,
  file: (
    <>
      <path d="M6 3 H14 L20 9 V21 H6 z" />
      <path d="M14 3 V9 H20" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2" />
      <path d="M3 20 a6 6 0 0 1 12 0 M14 20 a4 4 0 0 1 7 0" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21 a8 8 0 0 1 16 0" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12 V4 H11 L21 14 L13 22 z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12 a7 7 0 0 0-.1-1 l1.8-1.4 l-1.7-3 l-2.2 .8 a7 7 0 0 0-1.7-1 L14.5 4 h-5 l-.6 2.4 a7 7 0 0 0-1.7 1 l-2.2-.8 l-1.7 3 l1.8 1.4 a7 7 0 0 0 0 2 l-1.8 1.4 l1.7 3 l2.2-.8 a7 7 0 0 0 1.7 1 L9.5 20 h5 l.6-2.4 a7 7 0 0 0 1.7-1 l2.2 .8 l1.7-3 l-1.8-1.4 a7 7 0 0 0 .1-1z" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16 V11 a6 6 0 0 1 12 0 V16 L20 19 H4 z" />
      <path d="M10 22 a2 2 0 0 0 4 0" />
    </>
  ),
  moon: <path d="M21 13 a8 8 0 1 1-10-10 a6 6 0 0 0 10 10 z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2 V4 M12 20 V22 M2 12 H4 M20 12 H22 M5 5 L6.5 6.5 M17.5 17.5 L19 19 M5 19 L6.5 17.5 M17.5 6.5 L19 5" />
    </>
  ),
  "git-branch": (
    <>
      <circle cx="6" cy="5" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="19" r="2" />
      <path d="M6 7 V17 M8 6 a10 10 0 0 0 10 2 V8" />
    </>
  ),
  play: <path d="M7 4 V20 L20 12 z" />,
  pause: <path d="M7 4 H10 V20 H7 z M14 4 H17 V20 H14 z" />,
  edit: (
    <>
      <path d="M14 4 L20 10 L9 21 H3 V15 z" />
      <path d="M13 5 L19 11" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M15 9 V5 a2 2 0 0 0-2-2 H5 a2 2 0 0 0-2 2 V13 a2 2 0 0 0 2 2 h4" />
    </>
  ),
  external: (
    <>
      <path d="M14 3 H21 V10" />
      <path d="M21 3 L12 12" />
      <path d="M19 14 V19 a2 2 0 0 1-2 2 H5 a2 2 0 0 1-2-2 V7 a2 2 0 0 1 2-2 h5" />
    </>
  ),
  filter: <path d="M3 5 H21 L15 12 V20 L9 17 V12 z" />,
  circle: <circle cx="12" cy="12" r="9" />,
  checkmark: <path d="M4 12 L10 18 L20 6" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10 H21 M8 3 V7 M16 3 V7" />
    </>
  ),
  tower: (
    <>
      <path d="M7 3 V7 H17 V3 M5 7 H19 V21 H5 z" />
      <path d="M9 11 H11 V14 H9 z M13 11 H15 V14 H13 z M9 17 H15" />
    </>
  ),
  rune: (
    <>
      <path d="M12 3 L21 8 V16 L12 21 L3 16 V8 z" />
      <path d="M9 8 L12 14 L15 8 M9 14 H15" />
    </>
  ),
  map: (
    <>
      <path d="M3 6 L9 4 L15 6 L21 4 V18 L15 20 L9 18 L3 20 z" />
      <path d="M9 4 V18 M15 6 V20" />
    </>
  ),
};

export default function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
