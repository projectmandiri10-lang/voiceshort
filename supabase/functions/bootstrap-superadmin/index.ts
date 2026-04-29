import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const jsonHeaders = {
  "Content-Type": "application/json"
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  });
}

function fallbackDisplayName(email: string): string {
  return email.split("@")[0] || email;
}

async function findUserIdByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string
): Promise<{ id: string; hasPassword: boolean } | null> {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200
    });
    if (error) {
      throw error;
    }

    const found = data.users.find((entry) => entry.email?.toLowerCase() === email);
    if (found?.id) {
      return {
        id: found.id,
        hasPassword: Boolean(found.app_metadata?.provider === "email" || found.app_metadata?.providers?.includes?.("email"))
      };
    }

    if (data.users.length < 200) {
      return null;
    }

    page += 1;
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, {
      error: "Gunakan method POST."
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";
  const superadminEmail = (
    Deno.env.get("SUPERADMIN_EMAIL")?.trim() || "jho.j80@gmail.com"
  ).toLowerCase();
  const superadminPassword = Deno.env.get("SUPERADMIN_PASSWORD")?.trim() || "";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error: "SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum tersedia."
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    let userId: string | null = null;
    let hasPassword = false;

    const existingProfile = await supabase
      .from("profiles")
      .select("id,has_password")
      .eq("email", superadminEmail)
      .maybeSingle();
    if (existingProfile.error) {
      throw existingProfile.error;
    }
    userId = existingProfile.data?.id || null;
    hasPassword = Boolean(existingProfile.data?.has_password);

    if (!userId && superadminPassword) {
      const created = await supabase.auth.admin.createUser({
        email: superadminEmail,
        password: superadminPassword,
        email_confirm: true,
        user_metadata: {
          display_name: fallbackDisplayName(superadminEmail)
        }
      });

      if (created.error) {
        const knownConflict =
          created.error.message.toLowerCase().includes("registered") ||
          created.error.message.toLowerCase().includes("exists");
        if (!knownConflict) {
          throw created.error;
        }
      } else {
        userId = created.data.user?.id || null;
        hasPassword = true;
      }
    }

    if (!userId) {
      const found = await findUserIdByEmail(supabase, superadminEmail);
      userId = found?.id || null;
      hasPassword = Boolean(found?.hasPassword) || hasPassword;
    }

    if (!userId) {
      return jsonResponse(400, {
        error:
          "User superadmin belum ditemukan. Isi SUPERADMIN_PASSWORD agar function dapat membuat user pertama kali."
      });
    }

    const upserted = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          email: superadminEmail,
          display_name: fallbackDisplayName(superadminEmail),
          role: "superadmin",
          subscription_status: "active",
          video_quota_total: 1000,
          video_quota_used: 0,
          has_password: hasPassword || Boolean(superadminPassword) || true
        },
        { onConflict: "id" }
      )
      .select("*")
      .single();

    if (upserted.error) {
      throw upserted.error;
    }

    return jsonResponse(200, {
      ok: true,
      userId,
      profile: upserted.data
    });
  } catch (error) {
    return jsonResponse(500, {
      error: (error as Error).message
    });
  }
});
