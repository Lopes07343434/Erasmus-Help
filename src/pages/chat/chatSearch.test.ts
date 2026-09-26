import { describe, expect, it } from 'vitest'
import { foldText, publicIdMatches, searchConversations } from './chatSearch'
import { makeDirect, makeGroup, person } from './testFixtures'

describe('foldText', () => {
  it('ignores case and accents', () => {
    expect(foldText('Milão ÇA')).toBe('milao ca')
  })
})

describe('publicIdMatches', () => {
  it('matches the exact number however it is typed', () => {
    for (const q of ['7', '07', 'ID: 07', 'id 7', '#7']) expect(publicIdMatches(7, q), q).toBe(true)
  })

  it('matches IDs whose displayed form starts with the digits typed', () => {
    expect(publicIdMatches(10, '1')).toBe(true)
    expect(publicIdMatches(15, '1')).toBe(true)
    expect(publicIdMatches(123, '12')).toBe(true)
    expect(publicIdMatches(21, '1')).toBe(false)
  })

  it('"01" is ID 01 only, never 10 or 100', () => {
    expect(publicIdMatches(1, '01')).toBe(true)
    expect(publicIdMatches(10, '01')).toBe(false)
    expect(publicIdMatches(100, '01')).toBe(false)
    expect(publicIdMatches(11, 'ID: 01')).toBe(false)
  })

  it('rejects non-ID text and malformed numbers', () => {
    expect(publicIdMatches(7, 'ana')).toBe(false)
    expect(publicIdMatches(0, '0')).toBe(false)
  })
})

describe('searchConversations', () => {
  const ana = makeDirect({ id: 'c-ana', otherUser: person('u-ana', 12, 'Ana Costa', 'student') })
  const one = makeDirect({ id: 'c-one', otherUser: person('u-one', 1, 'Beatriz Nunes', 'student') })
  const ten = makeDirect({ id: 'c-ten', otherUser: person('u-ten', 10, 'Carlos Dias', 'student') })
  const nobody = makeDirect({ id: 'c-gone', otherUser: null })
  const group = makeGroup({ id: 'g1', name: 'Erasmus Milão 2026' })
  const untitled = makeGroup({ id: 'g2', name: null })

  it('finds direct chats by the person’s name (accent-insensitive) and groups by name', () => {
    expect(searchConversations([ana, one, nobody], [group, untitled], 'costa')).toEqual({ direct: [ana], groups: [] })
    expect(searchConversations([ana], [group, untitled], 'milao')).toEqual({ direct: [], groups: [group] })
  })

  it('puts the exact ID first and keeps the rest in list order', () => {
    const { direct } = searchConversations([ten, ana, one], [], '1')
    expect(direct.map((c) => c.id)).toEqual(['c-one', 'c-ten', 'c-ana'])
    expect(searchConversations([ten, ana, one], [], '01').direct).toEqual([one])
  })

  it('digits also match group names', () => {
    expect(searchConversations([ana], [group], '2026').groups).toEqual([group])
  })
})
