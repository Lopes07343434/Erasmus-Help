import type { ComponentPropsWithRef, HTMLAttributes, ReactNode, Ref } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cn } from './cn'

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

interface CardStyle {
  /** none = 0 · sm = 12px · md = 16px (default) · lg = 20px. */
  padding?: CardPadding
  /** Glass shadow (default true). Some prototype surfaces (list groups, recognised-text card) have none. */
  shadow?: boolean
}

const paddings: Record<CardPadding, string> = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' }

const cardBase = (padding: CardPadding, shadow: boolean) => cn('glass rounded-card text-text', shadow && 'shadow-glass', paddings[padding])

type CardElement = 'div' | 'section' | 'article' | 'li' | 'header' | 'aside'

type GlassCardProps = CardStyle &
  HTMLAttributes<HTMLElement> & {
    as?: CardElement
    ref?: Ref<HTMLElement>
    children?: ReactNode
  }

/** Static glass surface: surface + blur 18 + 1px border + radius 20 + glass shadow. */
export function GlassCard({ as: Tag = 'div', padding = 'md', shadow = true, className, children, ref, ...rest }: GlassCardProps) {
  const Comp = Tag as 'div'
  return (
    <Comp {...rest} ref={ref as Ref<HTMLDivElement>} className={cn(cardBase(padding, shadow), className)}>
      {children}
    </Comp>
  )
}

interface PressableStyle extends CardStyle {
  /** Active scale: md = .97 (grid tiles), sm = .985 (wide cards/list items). */
  press?: 'md' | 'sm'
}

const pressable = (press: 'md' | 'sm') =>
  cn('block w-full text-left no-underline transition-transform duration-150', press === 'md' ? 'active:scale-[.97]' : 'active:scale-[.985]')

type GlassCardButtonProps = PressableStyle & ComponentPropsWithRef<'button'>

/** Tappable glass card (e.g. "Tradutor" tile on Início). */
export function GlassCardButton({ padding = 'md', shadow = true, press = 'md', className, type = 'button', ...rest }: GlassCardButtonProps) {
  return <button {...rest} type={type} className={cn(cardBase(padding, shadow), pressable(press), className)} />
}

type GlassCardLinkProps = PressableStyle & LinkProps

/** Glass card that navigates (react-router Link). */
export function GlassCardLink({ padding = 'md', shadow = true, press = 'md', className, ...rest }: GlassCardLinkProps) {
  return <Link {...rest} className={cn(cardBase(padding, shadow), pressable(press), className)} />
}
