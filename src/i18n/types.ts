import type ptPT from './messages/pt-PT'

/** pt-PT is the reference catalogue; every other UI locale must match its shape exactly. */
export type Messages = typeof ptPT

type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> }

export type MessagesShape = Widen<Messages>
export type NamespaceShape<N extends keyof Messages> = Widen<Messages[N]>

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

export type MessageKey = Leaves<Messages>

/** Plural messages are stored as `<base>_one`, `<base>_few`, `<base>_many`, `<base>_other` (Intl.PluralRules categories). */
export type PluralKey = MessageKey extends infer K ? (K extends `${infer B}_other` ? B : never) : never

export type MessageParams = Record<string, string | number>
