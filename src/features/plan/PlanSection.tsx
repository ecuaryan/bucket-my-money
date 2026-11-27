import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ListSkeleton } from '@/components/ui/ListSkeleton'
import { LoadErrorPanel } from '@/components/ui/LoadErrorPanel'
import { TapHint } from '@/components/ui/TapHint'
import { PlanEditBar } from '@/features/plan/PlanEditBar'
import {
  keepPlanHistory,
  openPlanHistory,
  recordStep,
  returnStep,
  takeStep,
  type PlanAmount,
  type PlanAmountStep,
} from '@/lib/planUndo'
import { usePostgresChanges, type PostgresChangePayload } from '@/hooks/usePostgresChanges'
import { useHideAmounts } from '@/lib/HideAmountsProvider'
import { HIDDEN_MONEY_LABEL } from '@/lib/formatMoney'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import { formatErrorMessage } from '@/lib/errorMessage'
import {
  deleteBucket,
  humaniseBucketWriteError,
  renameBucket,
  updateBucketNotes,
  validateBucketNameForList,
} from '@/lib/buckets'
import {
  PLAN_ADD_INCOME_LABEL,
  PLAN_EMPTY_BODY,
  PLAN_EMPTY_VALUE,
  PLAN_LOADING_ARIA_LABEL,
  PLAN_LOAD_ERROR_TITLE,
  PLAN_RELOAD_ERROR,
  PLAN_TAB_LABEL,
  PLAN_LOCKED_NOTICE,
  PLAN_NOTES_ADD_LABEL,
  PLAN_NOTES_EDIT_LABEL,
  PLAN_NOTES_TITLE,
  planStepAnnouncement,
} from '@/lib/brand'
import { cellCents, lineYearlyUnits, planTotals, type PlanSection as Section } from '@/lib/planMath'
import { autoOrganizeDisplayName, fetchAutoOrganizes, type AutoOrganizeWithDetails } from '@/lib/autoOrganize'
import {
  addPlanLine,
  deletePlanLine,
  fetchPlanLines,
  fetchPlanNotes,
  fetchPlanRuleId,
  isPlanLinkableRule,
  linkPlanRule,
  movedSectionIds,
  planColumnForRule,
  planLineOnlyMoved,
  PLAN_COLUMNS,
  readPlanView,
  reorderPlanLines,
  setPlanLineAmount,
  setPlanNotes,
  updatePlanLineDetails,
  withSectionOrder,
  writePlanView,
  type PlanColumn,
  type PlanLine,
  type PlanViewPrefs,
} from '@/lib/plan'
import type { Database } from '@/types/database'
import PlanTable from './PlanTable'
import {
  PlanAddLineSheet,
  PlanLineSheet,
  PlanLinkSheet,
  PlanNotesSheet,
  PlanViewSheet,
  type AddLineValues,
  type LineDetailsValues,
  type PlanLinkRule,
} from './PlanSheets'
import { cellInputText, formatCellCents, parseCellInput, type PlanCellEdit } from './planCells'

type Bucket = Database['public']['Tables']['buckets']['Row']

/** A change made on this device within this window doesn't flash. */
const OWN_CHANGE_WINDOW_MS = 4000
const FLASH_MS = 1600
/** The bottom nav and the edit pill over it: a line under them isn't in view. */
const BOTTOM_CHROME_PX = 150
const SECTION_HEADER_PX = 44

function lineAmount(line: PlanLine): PlanAmount {
  return { unit: line.unit, value: (line.unit === 'percent' ? line.percentBp : line.amountCents) ?? 0n }
}

interface Props {
  familyId: string
  memberId: string
  accessToken: string | null
  isAdmin: boolean
  /** The household's buckets (bucket lines show their bucket's name and notes). */
  buckets: readonly Bucket[]
  /** A bucket was created, renamed or annotated from Plan. */
  onBucketsChanged: () => void
  /** Switch to the Auto-bucket tab. */
  onOpenAutoBucket: () => void
  /** The linked rule changed (the Auto-bucket tab should reload). */
  onLinkChanged: () => void
}


/** The Plan tab (docs/PLAN.md). Admins edit; shared members view. */
export default function PlanSection({
  familyId,
  memberId,
  accessToken,
  isAdmin,
  buckets,
  onBucketsChanged,
  onOpenAutoBucket,
  onLinkChanged,
}: Props) {
  const { formatMoney } = useHideAmounts()
  const masked = formatMoney(0) === HIDDEN_MONEY_LABEL

  const [lines, setLines] = useState<PlanLine[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<PlanViewPrefs>(() => readPlanView(memberId))
  const [editing, setEditingState] = useState<PlanCellEdit | null>(null)
  // Mirrors `editing` so Enter-then-blur (or Escape-then-blur) can't commit twice
  // through a stale closure: commit and cancel take the edit out of here first.
  const editingRef = useRef<PlanCellEdit | null>(null)
  function setEditing(next: PlanCellEdit | null) {
    editingRef.current = next
    setEditingState(next)
  }
  const [addSection, setAddSection] = useState<Section | null>(null)
  const [openLineId, setOpenLineId] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [flashIds, setFlashIds] = useState<ReadonlySet<string>>(new Set())
  const [rules, setRules] = useState<AutoOrganizeWithDetails[]>([])
  const [planRuleId, setPlanRuleId] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [notes, setNotes] = useState<string | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  // Typed number changes to step back and forward through, kept while the app is open.
  const [history, setHistory] = useState(() => openPlanHistory(memberId))
  useEffect(() => keepPlanHistory(memberId, history), [memberId, history])
  const [announcement, setAnnouncement] = useState('')

  const ownChanges = useRef(new Map<string, number>())
  const lastOwnAdd = useRef(0)
  const pendingFlash = useRef(new Set<string>())
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimers = useRef(new Set<ReturnType<typeof setTimeout>>())

  // Each load (and each local write) takes a new number; a load that finishes
  // after a newer one started is dropped, so a slow read never puts an old
  // value back on screen over a fresher edit.
  const loadSeq = useRef(0)
  const hasLoaded = useRef(false)
  const reorderQueue = useRef<Promise<void>>(Promise.resolve())
  const reordersPending = useRef(0)
  const amountQueue = useRef<Promise<void>>(Promise.resolve())
  const amountsPending = useRef(0)
  const sectionRef = useRef<HTMLElement>(null)

  const flash = useCallback((id: string) => {
    setFlashIds((prev) => new Set(prev).add(id))
    const timer = setTimeout(() => {
      flashTimers.current.delete(timer)
      setFlashIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, FLASH_MS)
    flashTimers.current.add(timer)
  }, [])

  const load = useCallback(async (): Promise<boolean> => {
    const seq = ++loadSeq.current
    try {
      const next = await fetchPlanLines()
      if (seq !== loadSeq.current) return false
      setLines(next)
      // Remote changes glow once their numbers are on screen, whichever load
      // (realtime or after a local write) brings them.
      for (const id of pendingFlash.current) flash(id)
      pendingFlash.current.clear()
      setLoadError(null)
      hasLoaded.current = true
      return true
    } catch (e) {
      if (seq !== loadSeq.current) return false
      if (hasLoaded.current) toast.error(PLAN_RELOAD_ERROR)
      else setLoadError(formatErrorMessage(e))
      return false
    }
  }, [flash])
  function invalidateLoads() {
    loadSeq.current += 1
  }

  // The linked rule and the household's rules (for the link picker). A failed
  // read just shows no link; it never blocks the plan.
  const loadLink = useCallback(async () => {
    try {
      const [ruleId, allRules, planNotes] = await Promise.all([
        fetchPlanRuleId(),
        fetchAutoOrganizes(),
        fetchPlanNotes(),
      ])
      setPlanRuleId(ruleId)
      setRules(allRules)
      setNotes(planNotes)
    } catch {
      // keep what we had
    }
  }, [])

  useEffect(() => {
    void loadLink()
  }, [loadLink])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const timers = flashTimers.current
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
      for (const t of timers) clearTimeout(t)
    }
  }, [])

  function markOwn(id: string) {
    ownChanges.current.set(id, Date.now())
  }
  function isOwn(id: string): boolean {
    const at = ownChanges.current.get(id)
    return at !== undefined && Date.now() - at < OWN_CHANGE_WINDOW_MS
  }

  const onRealtime = useCallback(
    (payload: PostgresChangePayload) => {
      if (payload.table === 'plans' || payload.table === 'auto_organizes') void loadLink()
      if (payload.table === 'plan_lines' && payload.eventType !== 'DELETE') {
        const id = (payload.new as { id?: string }).id
        const ownAdd = payload.eventType === 'INSERT' && Date.now() - lastOwnAdd.current < OWN_CHANGE_WINDOW_MS
        const onlyMoved =
          payload.eventType === 'UPDATE' &&
          planLineOnlyMoved(payload.old as Record<string, unknown>, payload.new as Record<string, unknown>)
        if (id && !isOwn(id) && !ownAdd && !onlyMoved) pendingFlash.current.add(id)
      }
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(() => {
        // Our own saves still queued: their reload, once the last lands, brings
        // this change in too. Loading now could show a value about to be replaced.
        if (amountsPending.current > 0 || reordersPending.current > 0) return
        void load()
      }, 150)
    },
    [load, loadLink],
  )

  const realtimeSpecs = useMemo(
    () => [
      { event: '*' as const, table: 'plan_lines', filter: `family_id=eq.${familyId}` },
      { event: '*' as const, table: 'plans', filter: `family_id=eq.${familyId}` },
      { event: '*' as const, table: 'auto_organizes', filter: `family_id=eq.${familyId}` },
    ],
    [familyId],
  )
  usePostgresChanges(accessToken, `plan:${familyId}`, realtimeSpecs, onRealtime)

  const bucketsById = useMemo(() => new Map(buckets.map((b) => [b.id, b])), [buckets])
  const lineName = useCallback(
    (line: PlanLine) =>
      line.bucketId ? bucketsById.get(line.bucketId)?.name ?? PLAN_EMPTY_VALUE : line.name ?? '',
    [bucketsById],
  )
  const lineNotes = useCallback(
    (line: PlanLine) => (line.bucketId ? bucketsById.get(line.bucketId)?.notes ?? null : line.notes),
    [bucketsById],
  )

  const totals = useMemo(() => planTotals(lines ?? []), [lines])

  const linkedRule = rules.find((r) => r.id === planRuleId) ?? null
  const linkedColumn = linkedRule ? planColumnForRule(linkedRule) : null
  const linkableRules: PlanLinkRule[] = rules
    .filter(isPlanLinkableRule)
    .map((r) => ({
      id: r.id,
      name: autoOrganizeDisplayName(r),
      cadenceSummary: r.cadenceSummary,
      bucketCount: new Set(r.lines.map((l) => l.bucket_id)).size,
    }))
  const planBucketCount = (lines ?? []).filter((l) => l.section === 'buckets').length
  // What the linked rule moves each run: the same floors the sync writes.
  const linkedRun = { cents: 0n, count: 0 }
  if (linkedColumn) {
    for (const line of lines ?? []) {
      if (line.section !== 'buckets' || !line.bucketId) continue
      const perRun = cellCents(lineYearlyUnits(line, totals.grossCents), linkedColumn)
      if (perRun >= 1n) {
        linkedRun.cents += perRun
        linkedRun.count += 1
      }
    }
  }

  async function changeLink(ruleId: string | null) {
    // Linking may copy the rule's buckets in: those new rows are ours, no glow.
    lastOwnAdd.current = Date.now()
    await linkPlanRule(ruleId)
    await Promise.all([load(), loadLink()])
    onLinkChanged()
  }
  const columns = PLAN_COLUMNS.filter((c) => !view.hiddenColumns.includes(c))
  // An admin who locked editing sees the plan as a shared member does.
  const canEdit = isAdmin && !view.locked
  // An open cell whose line was deleted (or editing locked) is no longer open;
  // otherwise it would keep drag-to-reorder off everywhere.
  const liveEditing =
    editing && canEdit && (lines ?? []).some((l) => l.id === editing.lineId) ? editing : null

  // Tapping a number while editing is locked says why nothing opens, in a hint
  // on what was tapped. Each tap shows it fresh (the key replays its entrance).
  const [lockedHint, setLockedHint] = useState<{ anchor: HTMLElement; key: number } | null>(null)
  const lockedHintKey = useRef(0)
  function showLockedHint(target: HTMLElement) {
    lockedHintKey.current += 1
    setLockedHint({ anchor: target, key: lockedHintKey.current })
  }

  function changeView(next: PlanViewPrefs) {
    setView(next)
    writePlanView(memberId, next)
  }

  function startEdit(line: PlanLine, column: PlanColumn) {
    // While Hide amounts is on, opening a cell would reveal the real number.
    if (masked) return
    const text = cellInputText(line, column, totals.grossCents)
    setEditing({ lineId: line.id, column, text, initial: text, invalid: false })
  }

  function cancelEdit() {
    setEditing(null)
  }

  /**
   * Commit the open cell. Empty text cancels. Invalid text stays open and is
   * marked invalid on Enter; leaving the cell (blur) with invalid text reverts.
   */
  async function commitEdit(via: 'enter' | 'blur') {
    const edit = editingRef.current
    if (!edit || !lines) return
    const text = edit.text.trim()
    if (text === '') {
      setEditing(null)
      return
    }
    const value = parseCellInput(edit.column, text)
    if (value === null) {
      setEditing(via === 'enter' ? { ...edit, invalid: true } : null)
      return
    }
    setEditing(null)
    const line = lines.find((l) => l.id === edit.lineId)
    if (!line) return
    // Tapping a cell stores nothing; only a new typed value does (no drift).
    // Compare with what the cell opened with, not with the line now: if the
    // other person changed it meanwhile, leaving the cell must not undo that.
    if (text === edit.initial.trim()) return

    const amount: PlanAmount = { unit: edit.column, value }
    const change: PlanAmountStep = { lineId: line.id, before: lineAmount(line), after: amount }
    setHistory((h) => recordStep(h, change))
    if (!(await saveAmount(line, amount))) setHistory((h) => returnStep(h, change, 'record'))
  }

  /**
   * Show a line's new number at once, then save it. Saves run one after
   * another, so quick Undo taps land in the order they were made, and the
   * plan reloads once the last is done (never stepping back through older values).
   */
  async function saveAmount(line: PlanLine, { unit, value }: PlanAmount): Promise<boolean> {
    const updated: PlanLine =
      unit === 'percent'
        ? { ...line, unit, percentBp: value, amountCents: null }
        : { ...line, unit, amountCents: value, percentBp: null }
    invalidateLoads()
    setLines((prev) => prev?.map((l) => (l.id === line.id ? updated : l)) ?? prev)
    markOwn(line.id)
    amountsPending.current += 1
    const save = amountQueue.current.then(() => setPlanLineAmount(line.id, unit, value))
    amountQueue.current = save.catch(() => {})
    let saved = true
    try {
      await save
    } catch (e) {
      saved = false
      toast.error(formatErrorMessage(e))
    }
    amountsPending.current -= 1
    if (amountsPending.current === 0) void load()
    return saved
  }

  const linesById = useMemo(() => new Map((lines ?? []).map((l) => [l.id, l])), [lines])
  const currentAmount = useCallback(
    (id: string) => {
      const line = linesById.get(id)
      return line ? lineAmount(line) : null
    },
    [linesById],
  )
  // Enabled only when a tap would change something: steps the other person
  // has since overwritten don't count.
  const canUndo = takeStep(history, 'undo', currentAmount).apply !== null
  const canRedo = takeStep(history, 'redo', currentAmount).apply !== null

  async function step(direction: 'undo' | 'redo') {
    const result = takeStep(history, direction, currentAmount)
    setHistory(result.history)
    const line = result.apply ? linesById.get(result.apply.step.lineId) : undefined
    if (!result.apply || !line) return
    const { step: change, amount } = result.apply
    // Like a sheet moving to the undone cell: the line glows, and comes into
    // view if it's off screen, so it's clear what changed.
    flash(line.id)
    requestAnimationFrame(() => revealLine(line.id))
    setAnnouncement('')
    requestAnimationFrame(() => setAnnouncement(planStepAnnouncement(direction, lineName(line))))
    if (!(await saveAmount(line, amount))) setHistory((h) => returnStep(h, change, direction))
  }

  function revealLine(lineId: string) {
    const row = sectionRef.current?.querySelector(`[role="row"][data-flip-id="${CSS.escape(lineId)}"]`)
    if (!row) return
    const rect = row.getBoundingClientRect()
    const head = sectionRef.current?.querySelector('[role="table"] [role="rowgroup"]')
    // Below the pinned table header and the section header pinned under it.
    const top = (head ? head.getBoundingClientRect().bottom : 0) + SECTION_HEADER_PX
    const bottom = window.innerHeight - BOTTOM_CHROME_PX
    if (rect.top < top || rect.bottom > bottom) row.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  async function createHouseholdBucket(name: string, notes: string | null): Promise<string> {
    const invalid = validateBucketNameForList(buckets.map((b) => b.name), name)
    if (invalid) throw new Error(invalid)
    const { data, error } = await supabase
      .from('buckets')
      .insert({ family_id: familyId, owner_member_id: null, name, allocated_amount: 0, notes: notes?.trim() || null })
      .select('id')
      .single()
    if (error) throw new Error(humaniseBucketWriteError(error))
    onBucketsChanged()
    return data.id
  }

  async function addLine(values: AddLineValues) {
    const createdBucketId = values.newBucketName
      ? await createHouseholdBucket(values.newBucketName, values.notes)
      : null
    lastOwnAdd.current = Date.now()
    invalidateLoads()
    try {
      await addPlanLine({
        section: values.section,
        unit: values.unit,
        value: values.value,
        name: values.name,
        bucketId: createdBucketId ?? values.bucketId,
        paidBy: values.paidBy,
        // A Buckets line keeps no note of its own: the note is the bucket's.
        notes: values.section === 'buckets' ? null : values.notes,
      })
    } catch (e) {
      // Don't leave behind an empty bucket the plan never got: a retry would
      // then fail as a duplicate name.
      if (createdBucketId) {
        await deleteBucket(createdBucketId).catch(() => {})
        onBucketsChanged()
      }
      throw e
    }
    // An existing bucket's note changes only once its line is on the plan.
    const picked = values.bucketId ? bucketsById.get(values.bucketId) : undefined
    if (picked && (values.notes?.trim() || null) !== (picked.notes?.trim() || null)) {
      try {
        await updateBucketNotes(picked.id, values.notes)
        onBucketsChanged()
      } catch (e) {
        toast.error(formatErrorMessage(e))
      }
    }
    setAddSection(null)
    await load()
  }

  async function saveDetails(line: PlanLine, values: LineDetailsValues) {
    markOwn(line.id)
    invalidateLoads()
    if (line.bucketId) {
      const bucket = bucketsById.get(line.bucketId)
      if (bucket && values.name !== bucket.name) await renameBucket(line.bucketId, values.name)
      if (bucket && (values.notes ?? null) !== (bucket.notes ?? null)) await updateBucketNotes(line.bucketId, values.notes)
      if (values.paidBy !== line.paidBy) {
        await updatePlanLineDetails(line.id, { name: null, paidBy: values.paidBy, notes: null })
      }
      onBucketsChanged()
    } else {
      await updatePlanLineDetails(line.id, values)
    }
    setOpenLineId(null)
    await load()
  }

  /**
   * Put a section's lines in a new order: shown at once, then saved. Saves run
   * one after another (quick Move up taps land in the order they were made),
   * and the plan reloads only once the last one is done, so the list never
   * steps back through an older order.
   */
  async function reorderSection(section: Section, lineIds: string[]) {
    invalidateLoads()
    setLines((prev) => (prev ? withSectionOrder(prev, section, lineIds) : prev))
    for (const id of lineIds) markOwn(id)
    reordersPending.current += 1
    const save = reorderQueue.current.then(() => reorderPlanLines(section, lineIds))
    reorderQueue.current = save.catch(() => {})
    try {
      await save
    } catch (e) {
      toast.error(formatErrorMessage(e))
    }
    reordersPending.current -= 1
    if (reordersPending.current === 0) void load()
  }

  function moveLine(line: PlanLine, direction: 'up' | 'down') {
    const ids = lines ? movedSectionIds(lines, line.id, direction) : null
    if (ids) void reorderSection(line.section, ids)
  }

  async function removeLine(line: PlanLine) {
    markOwn(line.id)
    invalidateLoads()
    await deletePlanLine(line.id)
    setOpenLineId(null)
    await load()
  }

  if (loadError && lines === null) {
    return <LoadErrorPanel title={PLAN_LOAD_ERROR_TITLE} message={loadError} onRetry={() => void load()} />
  }
  if (lines === null) {
    return <ListSkeleton label={PLAN_LOADING_ARIA_LABEL} rows={6} />
  }

  const openLine = openLineId ? lines.find((l) => l.id === openLineId) ?? null : null
  const plannedBucketIds = new Set(lines.map((l) => l.bucketId).filter(Boolean))
  const bucketOptions = buckets
    .filter((b) => b.owner_member_id === null && !plannedBucketIds.has(b.id))
    .map((b) => ({ id: b.id, name: b.name, notes: b.notes ?? null }))

  return (
    <section ref={sectionRef} aria-label={PLAN_TAB_LABEL}>
      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-zinc-950 px-6 py-12 text-center ring-1 ring-zinc-800">
          <p className="text-base text-zinc-300">{PLAN_EMPTY_BODY}</p>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setAddSection('income')}
              className="w-full max-w-72 rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400"
            >
              {PLAN_ADD_INCOME_LABEL}
            </button>
          ) : null}
        </div>
      ) : (
        <PlanTable
          lines={lines}
          totals={totals}
          columns={columns}
          compact={view.compact}
          locked={isAdmin && view.locked}
          onLockedTap={showLockedHint}
          canEdit={canEdit}
          flashIds={flashIds}
          editing={liveEditing}
          lineName={lineName}
          lineHasNote={(line) => Boolean(lineNotes(line)?.trim())}
          lineHasDetails={(line) => canEdit || Boolean(line.paidBy) || Boolean(lineNotes(line)?.trim())}
          masked={masked}
          onStartEdit={startEdit}
          onEditText={(text) => {
            const prev = editingRef.current
            if (prev) setEditing({ ...prev, text, invalid: false })
          }}
          onCommit={(via) => void commitEdit(via)}
          onCancel={cancelEdit}
          onOpenLine={(line) => setOpenLineId(line.id)}
          onReorder={(section, ids) => void reorderSection(section, ids)}
          onAdd={setAddSection}
          onOpenView={() => setViewOpen(true)}
          linkedColumn={linkedColumn}
          linkedRuleName={linkedRule ? autoOrganizeDisplayName(linkedRule) : null}
          onOpenLink={() => setLinkOpen(true)}
        />
      )}

      {/* One household note under the plan: what the table can't hold. Shared
          members see it when there is one; admins can always add one, even with
          editing locked (the lock guards the numbers). */}
      {lines.length > 0 && (notes || isAdmin) ? (
        <section
          aria-label={PLAN_NOTES_TITLE}
          className="mt-4 rounded-2xl bg-zinc-950 px-4 py-3 ring-1 ring-zinc-800"
        >
          <div className="flex min-h-11 items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-200">{PLAN_NOTES_TITLE}</h3>
            {isAdmin && notes ? (
              <button
                type="button"
                onClick={() => setNotesOpen(true)}
                className="-mr-2 rounded-lg px-2 py-2 text-sm font-medium text-emerald-400 transition hover:text-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
              >
                {PLAN_NOTES_EDIT_LABEL}
              </button>
            ) : null}
          </div>
          {notes ? (
            <p className="whitespace-pre-wrap break-words pb-1 text-sm leading-relaxed text-zinc-300">{notes}</p>
          ) : (
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className="mb-1 w-full rounded-lg py-2.5 text-sm font-semibold text-zinc-200 ring-1 ring-inset ring-zinc-700 transition hover:bg-zinc-800"
            >
              {PLAN_NOTES_ADD_LABEL}
            </button>
          )}
        </section>
      ) : null}

      {addSection ? (
        <PlanAddLineSheet
          key={addSection}
          section={addSection}
          bucketOptions={bucketOptions}
          onClose={() => setAddSection(null)}
          onAdd={addLine}
        />
      ) : null}

      {openLine ? (
        <PlanLineSheet
          key={openLine.id}
          line={openLine}
          displayName={lineName(openLine)}
          displayNotes={lineNotes(openLine)}
          canEdit={canEdit}
          canMoveUp={movedSectionIds(lines, openLine.id, 'up') !== null}
          canMoveDown={movedSectionIds(lines, openLine.id, 'down') !== null}
          onClose={() => setOpenLineId(null)}
          onSave={(values) => saveDetails(openLine, values)}
          onMove={(direction) => moveLine(openLine, direction)}
          onDelete={() => removeLine(openLine)}
        />
      ) : null}

      {notesOpen && isAdmin ? (
        <PlanNotesSheet
          notes={notes}
          onClose={() => setNotesOpen(false)}
          onSave={async (next) => {
            await setPlanNotes(next)
            setNotes(next)
            setNotesOpen(false)
          }}
        />
      ) : null}

      {isAdmin && lines.length > 0 && !liveEditing ? (
        <PlanEditBar
          locked={view.locked}
          canUndo={canUndo}
          canRedo={canRedo}
          onToggleLock={() => changeView({ ...view, locked: !view.locked })}
          onUndo={() => void step('undo')}
          onRedo={() => void step('redo')}
        />
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {lockedHint && isAdmin && view.locked ? (
        <TapHint
          key={lockedHint.key}
          anchor={lockedHint.anchor}
          text={PLAN_LOCKED_NOTICE}
          onDone={() => setLockedHint(null)}
        />
      ) : null}

      {viewOpen ? (
        <PlanViewSheet prefs={view} onChange={changeView} onClose={() => setViewOpen(false)} />
      ) : null}

      {linkOpen ? (
        <PlanLinkSheet
          canEdit={canEdit}
          linked={
            linkedRule
              ? {
                  id: linkedRule.id,
                  name: autoOrganizeDisplayName(linkedRule),
                  cadenceSummary: linkedRule.cadenceSummary,
                  bucketCount: linkedRun.count,
                }
              : null
          }
          linkableRules={linkableRules}
          eachRunText={formatCellCents(linkedRun.cents, masked)}
          bucketCount={linkedRun.count}
          planBucketCount={planBucketCount}
          onOpenAutoBucket={() => {
            setLinkOpen(false)
            onOpenAutoBucket()
          }}
          onLink={changeLink}
          onClose={() => setLinkOpen(false)}
        />
      ) : null}
    </section>
  )
}
