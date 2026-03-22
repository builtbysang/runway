import { readFileSync } from 'node:fs'

export type FlagValue = string | boolean

export interface ParsedArgs {
  command: string[]
  flags: Record<string, FlagValue>
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command: string[] = []
  const flags: Record<string, FlagValue> = {}

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) {
      command.push(current)
      continue
    }

    const trimmed = current.slice(2)
    if (!trimmed) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex >= 0) {
      const key = trimmed.slice(0, eqIndex)
      const value = trimmed.slice(eqIndex + 1)
      flags[key] = value
      continue
    }

    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      flags[trimmed] = true
      continue
    }

    flags[trimmed] = next
    index += 1
  }

  return { command, flags }
}

export function getStringFlag(flags: Record<string, FlagValue>, name: string): string | undefined {
  const value = flags[name]
  return typeof value === 'string' ? value : undefined
}

export function requireStringFlag(flags: Record<string, FlagValue>, name: string): string {
  const value = getStringFlag(flags, name)
  if (!value) {
    throw new Error(`Missing required flag: --${name}`)
  }
  return value
}

export function getStringArrayFlag(flags: Record<string, FlagValue>, name: string): string[] | undefined {
  const value = getStringFlag(flags, name)
  if (!value) return undefined
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function getNumberFlag(
  flags: Record<string, FlagValue>,
  name: string,
): number | undefined {
  const value = getStringFlag(flags, name)
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Flag --${name} must be a number`)
  }
  return parsed
}

export function readTextInput(flags: Record<string, FlagValue>, inlineFlag: string, fileFlag: string) {
  const inline = getStringFlag(flags, inlineFlag)
  if (inline) return inline

  const file = getStringFlag(flags, fileFlag)
  if (!file) {
    throw new Error(`Provide --${inlineFlag} or --${fileFlag}`)
  }

  return readFileSync(file, 'utf-8')
}

export function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}
