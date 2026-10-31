import AppVersionFooter from '@/components/AppVersionFooter'
import DemoHideAmountsToggle from '@/components/DemoHideAmountsToggle'
import DevToastPreview from '@/components/DevToastPreview'
import HeroMathSettingsCard from '@/features/settings/HeroMathSettingsCard'
import AccountSettingsCard from '@/features/settings/AccountSettingsCard'
import BiometricSettingsCard from '@/features/settings/BiometricSettingsCard'
import PinSettingsCard from '@/features/settings/PinSettingsCard'
import { SETTINGS_PAGE_TITLE } from '@/lib/brand'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">{SETTINGS_PAGE_TITLE}</h1>
      </header>

      <DevToastPreview />

      <DemoHideAmountsToggle />

      <HeroMathSettingsCard />

      <AccountSettingsCard />

      <PinSettingsCard />

      <BiometricSettingsCard />

      <AppVersionFooter />
    </div>
  )
}
