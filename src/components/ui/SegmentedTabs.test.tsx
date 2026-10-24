import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { SegmentedTabIcon } from '@/components/ui/SegmentedTabIcons'

const opt = (value: string, label: string) => ({ value, label })

describe('SegmentedTabs icons', () => {
  let root: Root
  let host: HTMLElement

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  function renderTabs(options: { value: string; label: string }[]) {
    act(() => {
      root.render(
        <SegmentedTabs
          value={options[0].value}
          options={options}
          onChange={() => {}}
          renderIcon={(tab) => <SegmentedTabIcon tab={tab} />}
          ariaLabel="Test tabs"
        />,
      )
    })
  }

  const tabs = () => [...host.querySelectorAll<HTMLElement>('[role="tab"]')]

  it('shows a decorative icon beside each label, leaving the label text unchanged', () => {
    renderTabs([opt('buckets', 'Buckets'), opt('auto-bucket', 'Auto-bucket'), opt('bank', 'Bank')])
    expect(tabs().map((t) => t.textContent)).toEqual(['Buckets', 'Auto-bucket', 'Bank'])
    for (const tab of tabs()) {
      const svg = tab.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg?.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('drops the icons with more than three tabs, so labels keep their room', () => {
    renderTabs([
      opt('buckets', 'Buckets'),
      opt('auto-bucket', 'Auto-bucket'),
      opt('bank', 'Bank'),
      opt('bitcoin', 'Bitcoin'),
    ])
    expect(tabs()).toHaveLength(4)
    expect(host.querySelectorAll('[role="tab"] svg')).toHaveLength(0)
  })

  it('has an icon for every tab the app uses', () => {
    renderTabs([opt('money-sources', 'Money sources'), opt('household', 'Household')])
    expect(host.querySelectorAll('[role="tab"] svg')).toHaveLength(2)
  })
})
