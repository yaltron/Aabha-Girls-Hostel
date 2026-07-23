import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401)
  }

  // Step 1: authorize the caller AS the caller, under normal RLS - this
  // client only ever sees what the calling user themselves can see.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
  } = await callerClient.auth.getUser()

  if (!user) {
    return jsonResponse({ error: 'Not authenticated' }, 401)
  }

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || !callerProfile || !['owner', 'warden'].includes(callerProfile.role)) {
    return jsonResponse({ error: 'Only owner or warden can enroll a student' }, 403)
  }

  // Step 2: parse and validate input.
  let body: { fullName?: string; phone?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }

  const fullName = body.fullName?.trim()
  const phone = body.phone?.trim()
  if (!fullName || !phone) {
    return jsonResponse({ error: 'fullName and phone are required' }, 400)
  }

  // Step 3: create the account. service_role client, used only here,
  // only for this one call.
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const email = `${phone}@aabha-hostel.internal`
  const password = generatePassword()

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  })

  if (createError || !created.user) {
    const isDuplicate = createError?.message?.toLowerCase().includes('already been registered')
    return jsonResponse({ error: isDuplicate ? 'A student with this phone number is already enrolled' : createError?.message ?? 'Could not create account' }, isDuplicate ? 409 : 400)
  }

  return jsonResponse({ profileId: created.user.id, password }, 200)
})
