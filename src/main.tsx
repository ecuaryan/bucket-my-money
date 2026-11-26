import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import ErrorBoundary from '@/components/ErrorBoundary'
import KeyboardViewport from '@/components/KeyboardViewport'
import { AuthProvider } from '@/lib/auth'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { migrateLegacyStorageKeys } from '@/lib/localStorageMigrate'
import { registerBackgroundPrivacyShield } from '@/lib/backgroundPrivacyShield'
import { registerActivityClock } from '@/lib/activityClock'
import { markAutoSignOut } from '@/lib/autoSignOut'
import { runExpiredBackgroundCleanup } from '@/lib/backgroundSessionCleanup'
import { supabase } from '@/lib/supabase'
import { setupPwaUpdates } from '@/lib/pwaUpdate'
import { installErrorReports } from '@/lib/errorReports'
import './index.css'

installErrorReports()
migrateLegacyStorageKeys()
registerBackgroundPrivacyShield()
registerActivityClock(() => {
  runExpiredBackgroundCleanup()
  markAutoSignOut()
  void supabase.auth.signOut({ scope: 'local' })
})
setupPwaUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <KeyboardViewport />
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
