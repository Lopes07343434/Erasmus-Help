import { useState } from 'react'
import { Copy, Flag, Globe, GraduationCap, IdCard, MapPin, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { Button, ListRow, ListSection, PageHeader, useToast } from '@/components/ui'
import { useChatSession } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import { publicIdLabel } from '@/pages/chat/chatFormat'
import { useCopyToClipboard } from '@/pages/chat/chatHooks'
import { CountrySheet } from '@/pages/onboarding/components/CountrySheet'
import { ROLE_ICONS } from '@/pages/onboarding/components/roleIcons'
import { countryFlag, getCountryName } from '@/services/geo'
import { useProfileStore } from '@/stores/profileStore'
import type { CityLocation } from '@/types/profile'
import { IdentityCard } from './components/IdentityCard'
import { NameSheet } from './components/NameSheet'
import { CitySheet, DeleteDataSheet, MyLanguageSheet, PrivacySheet, RoleSheet } from './components/ProfileSheets'
import { useDeleteDeviceData } from './useDeleteDeviceData'

type ProfileSheet = 'name' | 'role' | 'myLanguage' | 'country' | 'city' | 'privacy' | 'delete'

/** /profile — "Perfil": identity card, editable details, privacy info and "delete data from this device". */
export default function ProfilePage() {
  const { t, locale, languageName } = useI18n()
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
  const chatMe = useChatSession().me
  const copy = useCopyToClipboard()
  const chatId = chatMe ? publicIdLabel(chatMe.publicId) : ''

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

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader title={t('profile.title')} />
      <IdentityCard name={name} role={role} location={location} />

      <ListSection title={t('profile.sections.data')}>
        <ListRow icon={UserRound} label={t('profile.fields.name')} value={name || notSet} onClick={() => setSheet('name')} />
        {chatMe ? (
          // Once the Chat account exists the server role is authoritative (changes go through an admin).
          <ListRow icon={RoleIcon} label={t('profile.fields.role')} value={t(`chat.roles.${chatMe.role}`)} description={t('profile.fields.roleLocked')} />
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

      {chatId ? (
        <ListSection title={t('chat.id.yours')}>
          <ListRow
            icon={IdCard}
            label={<span className="font-mono text-base font-medium text-primary">{chatId}</span>}
            description={t('chat.id.hint')}
            trailing={
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
                <Copy size={15} aria-hidden="true" />
                {t('chat.id.copy')}
              </span>
            }
            aria-label={t('chat.id.copyAria', { id: chatId })}
            onClick={() => void copy(chatId)}
          />
        </ListSection>
      ) : null}

      <ListSection title={t('profile.sections.privacy')}>
        <ListRow icon={ShieldCheck} label={t('profile.privacy.row')} onClick={() => setSheet('privacy')} />
      </ListSection>

      <Button variant="dangerGhost" icon={Trash2} fullWidth onClick={() => setSheet('delete')}>
        {t('profile.deleteData.action')}
      </Button>

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
