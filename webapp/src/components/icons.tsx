import type { ReactNode, SVGProps } from "react";

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

interface BaseIconProps extends IconProps {
  children: ReactNode;
}

function BaseIcon({ size = 14, children, ...rest }: BaseIconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function ShieldCheckIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M12 3 4.5 6v6.2c0 4.9 3.2 8.9 7.5 9.8 4.3-.9 7.5-4.9 7.5-9.8V6L12 3Z" />
      <path d="m9.3 12.4 1.8 1.8 3.6-3.8" />
    </BaseIcon>
  );
}

export function MonitorIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="4.5" width="18" height="12.5" rx="1.8" />
      <path d="M12 17v3.2" />
      <path d="M8.2 20.2h7.6" />
    </BaseIcon>
  );
}

export function FileVideoIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M7 3.8h7l4 4V20a1.8 1.8 0 0 1-1.8 1.8H7A1.8 1.8 0 0 1 5.2 20V5.6A1.8 1.8 0 0 1 7 3.8Z" />
      <path d="M14 3.8V8h4" />
      <rect x="8.3" y="11" width="5.4" height="4.3" rx="0.7" />
      <path d="m13.8 13.1 2.8-1.6v3.2l-2.8-1.6Z" />
    </BaseIcon>
  );
}

export function InfoIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <path d="M12 7.2h.01" />
    </BaseIcon>
  );
}

export function UsersIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M16.7 20v-1.3a3.4 3.4 0 0 0-3.4-3.4H8.4A3.4 3.4 0 0 0 5 18.7V20" />
      <circle cx="10.9" cy="8.3" r="3" />
      <path d="M19.5 19.2v-1a2.8 2.8 0 0 0-2.8-2.8h-1.2" />
      <path d="M15.6 5.8a2.4 2.4 0 1 1 0 4.8" />
    </BaseIcon>
  );
}

export function ClockIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.5 2" />
    </BaseIcon>
  );
}

export function WifiIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M4 8.5a13 13 0 0 1 16 0" />
      <path d="M6.8 12a9 9 0 0 1 10.4 0" />
      <path d="M9.8 15.2a5 5 0 0 1 4.4 0" />
      <circle cx="12" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function WifiOffIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M4 8.5a13 13 0 0 1 10.9-1.7" />
      <path d="M6.8 12a9 9 0 0 1 5.8-1.4" />
      <path d="M9.8 15.2a5 5 0 0 1 1.7-.3" />
      <path d="m4 4 16 16" />
    </BaseIcon>
  );
}

export function GridIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M9 3.5v17" />
      <path d="M15 3.5v17" />
      <path d="M3.5 9h17" />
      <path d="M3.5 15h17" />
    </BaseIcon>
  );
}

export function EyeIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </BaseIcon>
  );
}

export function AlertTriangleIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M11.1 4.7 3.8 18.4a1.3 1.3 0 0 0 1.1 1.9h14.2a1.3 1.3 0 0 0 1.1-1.9L12.9 4.7a1.3 1.3 0 0 0-1.8 0Z" />
      <path d="M12 9.2v5.1" />
      <path d="M12 17.3h.01" />
    </BaseIcon>
  );
}

export function FilterIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M4 5.3h16" />
      <path d="M7 11h10" />
      <path d="M10 16.7h4" />
    </BaseIcon>
  );
}

export function SearchIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <circle cx="11" cy="11" r="6.8" />
      <path d="m20 20-4.2-4.2" />
    </BaseIcon>
  );
}

export function RadioIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="1.6" />
      <path d="M7.4 12a4.6 4.6 0 0 1 0-1" />
      <path d="M16.6 11a4.6 4.6 0 0 1 0 2" />
      <path d="M5.1 9.5a8 8 0 0 0 0 5" />
      <path d="M18.9 9.5a8 8 0 0 1 0 5" />
    </BaseIcon>
  );
}

export function SignalIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M5.2 18.8h2.5v-2.4H5.2Z" />
      <path d="M9.4 18.8h2.5v-5.1H9.4Z" />
      <path d="M13.6 18.8h2.5v-7.7h-2.5Z" />
      <path d="M17.8 18.8h2.5V7.5h-2.5Z" />
    </BaseIcon>
  );
}

export function BatteryIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <rect x="3.3" y="7.4" width="17.1" height="9.2" rx="1.6" />
      <path d="M20.4 10.4H22v3.2h-1.6" />
    </BaseIcon>
  );
}

export function RotateIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.3" />
      <path d="M19.4 6.5v4.4H15" />
    </BaseIcon>
  );
}

export function MapPinIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M12 21s6-5.4 6-10a6 6 0 1 0-12 0c0 4.6 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </BaseIcon>
  );
}

export function CompassIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m14.8 9.2-2.3 5.6-5.4 2.2 2.2-5.4 5.5-2.4Z" />
    </BaseIcon>
  );
}

export function ActivityIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M3.5 12h3.3l2.2-4.2 3.4 8.4 2.2-4.2h5.9" />
    </BaseIcon>
  );
}

export function CircleIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function SquareIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function CopyIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <rect x="8" y="8" width="10.5" height="11" rx="1.6" />
      <path d="M6 15.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h9a1.5 1.5 0 0 1 1.5 1.5v1" />
    </BaseIcon>
  );
}

export function CheckIcon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="m5.3 12.2 4.2 4.1 9.2-9.1" />
    </BaseIcon>
  );
}
