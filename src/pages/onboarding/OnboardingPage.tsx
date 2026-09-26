import { useSearchParams } from 'react-router'
import { AppBackground, ToastProvider } from '@/components/ui'
import { selectIsOnboarded, useProfileStore } from '@/stores/profileStore'
import { IntroScreen } from './components/IntroScreen'
import { SetupScreen } from './components/SetupScreen'
import { SplashScreen } from './components/SplashScreen'
import { useOnboardingFlow } from './useOnboardingFlow'

/**
 * /welcome — first run: splash → 3 intro slides → 5 setup questions.
 * /welcome?intro=1 (already onboarded, from Settings → Sobre): only the intro slides, then home.
 * Lives outside AppLayout, so it mounts its own background and toast provider.
 */
export default function OnboardingPage() {
  const [params] = useSearchParams()
  const onboarded = useProfileStore(selectIsOnboarded)
  const introOnly = onboarded && params.get('intro') === '1'

  return (
    <ToastProvider>
      <div className="relative min-h-dvh overflow-x-clip text-text">
        <AppBackground />
        <OnboardingFlowView introOnly={introOnly} />
      </div>
    </ToastProvider>
  )
}

function OnboardingFlowView({ introOnly }: { introOnly: boolean }) {
  const flow = useOnboardingFlow(introOnly)
  switch (flow.state.phase) {
    case 'splash':
      return <SplashScreen onDone={flow.endSplash} />
    case 'intro':
      return <IntroScreen flow={flow} introOnly={introOnly} />
    case 'setup':
      return <SetupScreen flow={flow} />
  }
}
