import { forwardRef } from 'react'
import NavTabIcon, { type NavTabId } from '@/components/layout/NavTabIcon'
import { activeNavTabIndex } from '@/components/layout/navBubbleIndicator'
import {
  APP_CHROME_Z_INDEX,
  NAV_BAR_BODY_PX,
  NAV_BUCKET_ACTIVE_SCALE,
  NAV_BUBBLE_RADIUS_PX,
  NAV_BUBBLE_SIZE_PX,
  NAV_ICON_ACTIVE_SCALE,
  NAV_LABEL_ROW_PX,
  navIconTransform,
} from '@/components/layout/navLayout'
import { useNavBubbleIndicator } from '@/components/layout/useNavBubbleIndicator'
import { NAV_BUCKETS_LABEL } from '@/lib/brand'
import type { NavTabItem } from '@/components/layout/navTabs'
import { NavLink, useLocation } from 'react-router-dom'

const SAFE_BOTTOM = 'pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]'

const iconMotion =
  'motion-safe:transition-[transform] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]'

type BottomNavProps = {
  tabs: NavTabItem[]
}

export default function BottomNav({ tabs }: BottomNavProps) {
  const { pathname } = useLocation()
  const activeIndex = activeNavTabIndex(tabs, pathname)
  const { listRef, setTabRef, centerX } = useNavBubbleIndicator(activeIndex)

  return (
    <nav
      className={
        'fixed inset-x-0 bottom-0 overflow-visible border-t border-neutral-800 bg-neutral-900/65 backdrop-blur-xl ' +
        SAFE_BOTTOM
      }
      style={{ zIndex: APP_CHROME_Z_INDEX }}
    >
      <ul
        ref={listRef}
        className="relative z-10 mx-auto flex max-w-md items-stretch px-1 pb-1 sm:px-2"
        style={{ paddingTop: NAV_BUBBLE_RADIUS_PX }}
      >
        {centerX != null ? (
          <div
            aria-hidden
            className={
              'pointer-events-none absolute top-0 left-0 z-[5] rounded-full ' +
              'bg-zinc-800 shadow-lg shadow-black/40 ring-1 ring-emerald-500/35 ' +
              'motion-safe:transition-[transform] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]'
            }
            style={{
              width: NAV_BUBBLE_SIZE_PX,
              height: NAV_BUBBLE_SIZE_PX,
              transform: `translate3d(${centerX - NAV_BUBBLE_RADIUS_PX}px, -50%, 0)`,
            }}
          />
        ) : null}
        {tabs.map((item, index) => (
          <TabLink
            key={navTabKey(item, index)}
            ref={setTabRef(index)}
            item={item}
          />
        ))}
      </ul>
    </nav>
  )
}

function navTabKey(item: NavTabItem, index: number): string {
  return item.kind === 'buckets' ? '/' : `${item.to}-${index}`
}

function tabProps(item: NavTabItem): { to: string; label: string; tab: NavTabId } {
  if (item.kind === 'buckets') {
    return { to: '/', label: NAV_BUCKETS_LABEL, tab: 'buckets' }
  }
  return { to: item.to, label: item.label, tab: item.tab }
}

const TabLink = forwardRef<HTMLLIElement, { item: NavTabItem }>(function TabLink(
  { item },
  ref,
) {
  const { to, label, tab } = tabProps(item)

  return (
    <li ref={ref} className="min-w-0 flex-1">
      <NavLink
        to={to}
        end
        aria-label={label}
        className={({ isActive }) =>
          [
            'relative flex w-full flex-col items-center overflow-visible px-0.5 text-[10px] font-medium leading-none sm:text-[11px]',
            isActive ? 'text-emerald-300' : 'text-zinc-400 hover:text-zinc-300',
          ].join(' ')
        }
      >
        {({ isActive }) => (
          <>
            <div
              className="absolute left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{
                top: -NAV_BUBBLE_RADIUS_PX,
                width: NAV_BUBBLE_SIZE_PX,
                height: NAV_BUBBLE_SIZE_PX,
              }}
            >
              <span
                className={
                  'inline-flex h-5 w-5 shrink-0 origin-center items-center justify-center ' +
                  iconMotion
                }
                style={{
                  transform: navIconTransform(
                    isActive,
                    tab === 'buckets' ? NAV_BUCKET_ACTIVE_SCALE : NAV_ICON_ACTIVE_SCALE,
                  ),
                }}
              >
                <NavTabIcon tab={tab} size="default" />
              </span>
            </div>
            <div
              className="w-full shrink-0"
              style={{ height: NAV_BAR_BODY_PX }}
              aria-hidden
            />
            <span
              className={
                'flex w-full shrink-0 items-start justify-center truncate motion-safe:transition-[font-weight,color] motion-safe:duration-300 ' +
                (isActive ? 'font-semibold' : '')
              }
              style={{ height: NAV_LABEL_ROW_PX }}
            >
              {label}
            </span>
          </>
        )}
      </NavLink>
    </li>
  )
})
