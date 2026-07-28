import {
  AppWindow,
  ArrowUpRight,
  Check,
  CircleGauge,
  Copy,
  ExternalLink,
  FlaskConical,
  Globe2,
  Link2,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  UsersRound,
  X,
} from 'lucide-react'
import type { ComponentProps } from 'react'

const icons = {
  apps: AppWindow,
  arrow: ArrowUpRight,
  check: Check,
  copy: Copy,
  domains: Globe2,
  external: ExternalLink,
  links: Link2,
  logout: LogOut,
  menu: Menu,
  more: MoreHorizontal,
  overview: CircleGauge,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  settings: Settings,
  team: UsersRound,
  test: FlaskConical,
  x: X,
} as const

export type IconName = keyof typeof icons

type IconProps = Omit<ComponentProps<'svg'>, 'name'> & {
  name: IconName
  size?: number
}

export function Icon({ name, size = 17, ...props }: IconProps) {
  const IconComponent = icons[name]
  return (
    <IconComponent aria-hidden="true" focusable="false" size={size} strokeWidth={1.9} {...props} />
  )
}
