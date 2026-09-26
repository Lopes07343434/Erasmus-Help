import { useState } from 'react'
import { Flag, Globe, GraduationCap, MapPin, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { Button, ListRow, ListSection, PageHeader, useToast } from '@/components/ui'
import { useChatSession, useProfileActions } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import { chatErrorMessage } from '@/pages/chat/chatErrors'
import { publicIdLabel } from '@/pages/chat/chatFormat'
import { useCopyToClipboard } from '@/pages/chat/chatHooks'
import { PhotoSheet } from '@/pages/chat/components/PhotoSheet'
import { CountrySheet } from '@/pages/onboarding/components/CountrySheet'
import { ROLE_ICONS } from '@/pages/onboarding/components/roleIcons'
import { countryFlag, getCountryName } from '@/services/geo'
import { useProfileStore } from '@/stores/profileStore'
import type { CityLocation } from '@/types/profile'
import { IdentityCard } from './components/IdentityCard'
import { NameSheet } from './components/NameSheet'
import { CitySheet, DeleteDataSheet, MyLanguageSheet, PrivacySheet, RoleSheet } from './components/ProfileSheets'
import { useDeleteDeviceData } from './useDeleteDeviceData'

type ProfileSheet = 'photo' | 'name' | 'role' | 'myLanguage' | 'country' | 'city' | 'privacy' | 'delete'

/**
 * /profile — "Perfil": identity card (photo, name, type, chat ID with "Copiar ID"), editable details, privacy info
 * and "delete data from this device".
 */
export default function ProfilePage() {
  const i18n = useI18n()
  const { t, locale, languageName } = i18n
  const toast = useToast()
  const name = useProfileStore((s) => s.name)
  const role = useProfileStore((s) => s.role)
  const myLanguage = useProfileStore((s) => s.myLanguage)
  const location = useProfileStore((s) => s.location)
  const setName = useProfileStore((s) => s.setName)
  const setRole = useProfileStore((s) => s.setRole)
  const setMyLanguage = useProfileStore((s) => s.setMyLanguage)
  const setLocation = useProfileStore((s) => s.setLocation)
  const deleteDeviceData = useDeleteDeviceData()
  const chatSession = useChatSession()
  const chatMe = chatSession.me
  const profileActions = useProfileActions()
  const copy = useCopyToClipboard()
  const chatId = chatMe ? publicIdLabel(chatMe.publicId) : ''
  // Photos live in the chat account: none in a build without chat; disabled (with a note) until it is connected.
  const photoAvailable = chatSession.status !== 'not-configured'
  const photoReady = chatSession.status === 'ready' && chatMe !== null

  const [sheet, setSheet] = useState<ProfileSheet | null>(null)
  /** Country picked in the country sheet, waiting for a city before the location is saved. */
  const [pendingCountry, setPendingCountry] = useState<string | null>(null)

  const close = () => {
    setSheet(null)
    setPendingCountry(null)
  }
  const saved = () => {
    close()
    toast.show(t('profile.saved'))
  }

  const pickCountry = (code: string) => {
    if (location && code === location.countryCode) return close()
    // A new country needs a new city: open the city sheet once the country sheet has closed (focus return).
    setSheet(null)
    setPendingCountry(code)
    requestAnimationFrame(() => setSheet('city'))
  }

  const saveCity = (city: CityLocation) => {
    const countryCode = pendingCountry ?? location?.countryCode
    if (countryCode && setLocation({ countryCode, city })) saved()
  }

  const notSet = t('profile.fields.notSet')
  const RoleIcon = role ? ROLE_ICONS[role] : GraduationCap
  const cityCountry = pendingCountry ?? location?.countryCode ?? null
  // Once the Chat account exists the server role is authoritative (changes go through an admin).
  const roleLabel = chatMe ? t(`chat.roles.${chatMe.role}`) : role ? t(`common.roles.${role}`) : null
  const photo = chatMe?.avatarPath ?? null

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader title={t('profile.title')} />
      <IdentityCard
        name={name}
        roleLabel={roleLabel}
        location={location}
        photo={photo}
        onEditPhoto={photoAvailable ? () => setSheet('photo') : undefined}
        publicId={chatId || null}
        onCopyId={(id) => void copy(id)}
      />

      <ListSection title={t('profile.sections.data')}>
        <ListRow icon={UserRound} label={t('profile.fields.name')} value={name || notSet} onClick={() => setSheet('name')} />
        {chatMe ? (
          <ListRow icon={RoleIcon} label={t('profile.fields.role')} value={roleLabel} description={t('profile.fields.roleLocked')} />
        ) : (
          <ListRow icon={RoleIcon} label={t('profile.fields.role')} value={role ? t(`common.roles.${role}`) : notSet} onClick={() => setSheet('role')} />
        )}
        <ListRow
          icon={Globe}
          label={t('profile.fields.myLanguage')}
          value={myLanguage ? languageName(myLanguage) : notSet}
          onClick={() => setSheet('myLanguage')}
        />
        <ListRow
          icon={Flag}
          label={t('profile.fields.country')}
          value={location ? `${countryFlag(location.countryCode)} ${getCountryName(location.countryCode, locale)}` : notSet}
          onClick={() => setSheet('country')}
        />
        <ListRow
          icon={MapPin}
          label={t('profile.fields.city')}
          value={location ? location.city.name : notSet}
          onClick={() => setSheet(location ? 'city' : 'country')}
        />
      </ListSection>

      <ListSection title={t('profile.sections.privacy')}>
        <ListRow icon={ShieldCheck} label={t('profile.privacy.row')} onClick={() => setSheet('privacy')} />
      </ListSection>

      <Button variant="dangerGhost" icon={Trash2} fullWidth onClick={() => setSheet('delete')}>
        {t('profile.deleteData.action')}
      </Button>

      <PhotoSheet
        open={sheet === 'photo'}
        onClose={close}
        labels={{
          title: t('profile.photo.menuTitle'),
          choose: t('profile.photo.choose'),
          remove: t('profile.photo.remove'),
          saving: t('profile.photo.saving'),
          invalid: t('profile.photo.invalid'),
        }}
        photo={photo}
        name={name}
        unavailable={photoReady ? null : t('profile.photo.unavailable')}
        onSave={async (image) => {
          await profileActions.setMyAvatar(image)
          close()
          toast.show(t(image ? 'profile.photo.updated' : 'profile.photo.removed'))
        }}
        errorMessage={(err) => chatErrorMessage(err, i18n)}
      />
      <NameSheet
        open={sheet === 'name'}
        onClose={close}
        currentName={name}
        onSave={(value) => {
          const ok = setName(value)
          if (ok) saved()
          return ok
        }}
      />
      <RoleSheet
        open={sheet === 'role'}
        onClose={close}
        value={role}
        onChange={(value) => {
          if (value !== role) {
            setRole(value)
            toast.show(t('profile.saved'))
          }
        }}
      />
      <MyLanguageSheet
        open={sheet === 'myLanguage'}
        onClose={close}
        value={myLanguage}
        onSelect={(code) => {
          if (code === myLanguage) return close()
          setMyLanguage(code)
          saved()
        }}
      />
      <CountrySheet open={sheet === 'country'} onClose={close} value={location?.countryCode ?? null} onSelect={pickCountry} />
      <CitySheet
        open={sheet === 'city'}
        onClose={close}
        countryCode={cityCountry}
        value={pendingCountry ? null : (location?.city ?? null)}
        onSelect={saveCity}
      />
      <PrivacySheet open={sheet === 'privacy'} onClose={close} />
      <DeleteDataSheet open={sheet === 'delete'} onClose={close} onConfirm={deleteDeviceData} />
    </div>
  )
}
