import { promises as fs } from "fs"
import path from "path"

const DATA_DIR = path.resolve(process.cwd(), "data")
const PROFILE_PATH = path.join(DATA_DIR, "assistant-profile.json")

function sanitizeString(value) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

function sanitizeAgenda(input) {
  if (!input) return undefined
  if (Array.isArray(input)) {
    const cleaned = input
      .map((item) => sanitizeString(item))
      .filter((item) => typeof item === "string")
    return cleaned.length ? cleaned : undefined
  }
  const single = sanitizeString(input)
  return single ? [single] : undefined
}

export function normalizeProfile(raw = {}) {
  const companyBio =
    sanitizeString(raw.companyBio) ??
    sanitizeString(raw.bio)
  const salesIntent =
    sanitizeString(raw.salesIntent) ??
    sanitizeString(raw.intent)
  const successCriteria =
    sanitizeString(raw.successCriteria) ??
    sanitizeString(raw.success)
  const agenda = sanitizeAgenda(raw.agenda)

  const profile = {}
  if (companyBio) profile.companyBio = companyBio
  if (salesIntent) profile.salesIntent = salesIntent
  if (successCriteria) profile.successCriteria = successCriteria
  if (agenda) profile.agenda = agenda

  return profile
}

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

export async function loadPersistedProfile() {
  try {
    const raw = await fs.readFile(PROFILE_PATH, "utf8")
    const parsed = JSON.parse(raw)
    const profile = normalizeProfile(parsed)
    return Object.keys(profile).length ? profile : null
  } catch (error) {
    if (error.code === "ENOENT") return null
    console.warn("[profile-store] load error:", error.message || error)
    return null
  }
}

export async function savePersistedProfile(raw = {}) {
  const profile = normalizeProfile(raw)
  await ensureDataDir()
  await fs.writeFile(PROFILE_PATH, JSON.stringify(profile, null, 2), "utf8")
  return profile
}

export function profileToSetProfileArgs(profile = {}) {
  const normalized = normalizeProfile(profile)
  return {
    companyBio: normalized.companyBio,
    salesIntent: normalized.salesIntent,
    successCriteria: normalized.successCriteria,
    agenda: normalized.agenda,
  }
}

