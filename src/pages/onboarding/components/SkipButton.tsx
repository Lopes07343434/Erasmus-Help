import type { ComponentPropsWithRef } from 'react'

/**
 * The prototype's "Saltar": 44px text button in text2 with a primary-soft hover. The kit's ghost Button
 * is primary-coloured, so this neutral variant lives here.
 */
export function SkipButton({ type = 'button', ...rest }: Omit<ComponentPropsWithRef<'button'>, 'className'>) {
  return (
    <button
      {...rest}
      type={type}
      className="-mr-3 min-h-11 shrink-0 rounded-chip border-0 bg-transparent px-3 text-[15px] font-semibold text-text2 transition-colors duration-150 hover:bg-primary-soft active:bg-primary-soft"
    />
  )
}
