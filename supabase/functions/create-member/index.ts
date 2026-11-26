// @ts-nocheck — Deno Edge Function runtime.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { handleCors, jsonResponse } from '../_shared/http.ts'
import {
  MEMBER_NAME_DUPLICATE,
  memberNameTaken,
} from '../_shared/memberName.ts'
import { requireAdmin, serviceClient } from '../_shared/supabase.ts'
import { memberAuthEmail } from '../_shared/pin.ts'

type Body = {
  name?: string
  role?: 'admin' | 'member' | 'child'
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const auth = await requireAdmin(req.headers.get('Authorization'))
  if (!auth.ok) return auth.response

  let body: Body
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const name = body.name?.trim()
  const role = body.role ?? 'member'
  if (!name) {
    return jsonResponse({ error: 'Name is required' }, 400)
  }
  if (role !== 'admin' && role !== 'member' && role !== 'child') {
    return jsonResponse({ error: 'role must be admin, member, or child' }, 400)
  }

  const admin = serviceClient()

  const { data: existingRows, error: listError } = await admin
    .from('family_members')
    .select('name')
    .eq('family_id', auth.familyId)

  if (listError) {
    console.error('create-member list names', listError)
    return jsonResponse({ error: 'Could not create member' }, 500)
  }

  if (memberNameTaken(existingRows?.map((r) => r.name) ?? [], name)) {
    return jsonResponse({ error: MEMBER_NAME_DUPLICATE }, 409)
  }

  const { data: memberRow, error: insertError } = await admin
    .from('family_members')
    .insert({
      family_id: auth.familyId,
      name,
      role,
      is_account_owner: false,
    })
    .select('id, name, role, family_id, created_at')
    .single()

  if (insertError || !memberRow) {
    console.error('create-member insert', insertError)
    if (insertError?.code === '23505') {
      return jsonResponse({ error: MEMBER_NAME_DUPLICATE }, 409)
    }
    // Household limit (migration 120); the message is user-facing. The row
    // was rolled back before any login was created.
    if (insertError?.code === '54000') {
      return jsonResponse({ error: insertError.message }, 409)
    }
    return jsonResponse({ error: 'Could not create member' }, 500)
  }

  const email = memberAuthEmail(memberRow.id)
  const password = crypto.randomUUID() + crypto.randomUUID()

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { member_id: memberRow.id, role },
  })

  if (userError || !userData.user) {
    await admin.from('family_members').delete().eq('id', memberRow.id)
    console.error('create-member auth user', userError)
    return jsonResponse({ error: 'Could not create login' }, 500)
  }

  const { error: linkError } = await admin
    .from('family_members')
    .update({ user_id: userData.user.id })
    .eq('id', memberRow.id)

  if (linkError) {
    await admin.auth.admin.deleteUser(userData.user.id)
    await admin.from('family_members').delete().eq('id', memberRow.id)
    console.error('create-member link', linkError)
    return jsonResponse({ error: 'Could not link member' }, 500)
  }

  return jsonResponse({
    member: {
      id: memberRow.id,
      name: memberRow.name,
      role: memberRow.role,
      familyId: memberRow.family_id,
      hasPin: false,
      pinLocked: false,
    },
  })
})
