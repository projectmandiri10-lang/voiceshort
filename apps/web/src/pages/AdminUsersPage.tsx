import { useEffect, useState, type FormEvent } from "react";
import { Ban, Gift, Save, ShieldUser, UserPlus } from "lucide-react";
import {
  createAdminUser,
  disableAdminUser,
  fetchAdminUsers,
  grantAdminUserPackage,
  updateAdminUser,
} from "../api";
import type { AdminUserRecord, AssignedPackageCode, UserRole } from "../types";

interface AdminUsersPageProps {
  onRefreshSession: () => Promise<void>;
}

interface UserDraft {
  displayName: string;
  role: UserRole;
  subscriptionStatus: "active" | "inactive";
  isUnlimited: boolean;
  disabled: boolean;
  disabledReason: string;
  assignedPackageCode: AssignedPackageCode | "";
}

interface GrantDraft {
  packageCode: AssignedPackageCode;
  customAmountIdr: number;
  description: string;
}

const PACKAGE_LABEL: Record<AssignedPackageCode, string> = {
  "10_video": "10 video",
  "50_video": "50 video",
  "100_video": "100 video",
  custom: "Custom",
};

const PACKAGE_CREDIT: Record<Exclude<AssignedPackageCode, "custom">, number> = {
  "10_video": 20_000,
  "50_video": 100_000,
  "100_video": 200_000,
};

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function toDraft(user: AdminUserRecord): UserDraft {
  return {
    displayName: user.displayName,
    role: user.role,
    subscriptionStatus: user.subscriptionStatus,
    isUnlimited: user.isUnlimited,
    disabled: Boolean(user.disabledAt),
    disabledReason: user.disabledReason ?? "",
    assignedPackageCode: user.assignedPackageCode ?? "",
  };
}

function defaultGrantDraft(user: AdminUserRecord): GrantDraft {
  return {
    packageCode: user.assignedPackageCode ?? "10_video",
    customAmountIdr: 20_000,
    description: "",
  };
}

function upsertUser(users: AdminUserRecord[], updated: AdminUserRecord): AdminUserRecord[] {
  return users.some((user) => user.email === updated.email)
    ? users.map((user) => (user.email === updated.email ? updated : user))
    : [updated, ...users];
}

export function AdminUsersPage({ onRefreshSession }: AdminUsersPageProps) {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [grantDrafts, setGrantDrafts] = useState<Record<string, GrantDraft>>({});
  const [createDraft, setCreateDraft] = useState({
    email: "",
    password: "",
    displayName: "",
    role: "user" as UserRole,
    subscriptionStatus: "active" as "active" | "inactive",
    isUnlimited: false,
  });
  const [loading, setLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [grantingEmail, setGrantingEmail] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const hydrateUsers = (result: AdminUserRecord[]) => {
    setUsers(result);
    setDrafts(Object.fromEntries(result.map((user) => [user.email, toDraft(user)])));
    setGrantDrafts(Object.fromEntries(result.map((user) => [user.email, defaultGrantDraft(user)])));
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const result = await fetchAdminUsers();
        if (!mounted) {
          return;
        }
        hydrateUsers(result);
        setError("");
      } catch (loadError) {
        if (mounted) {
          setError((loadError as Error).message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const syncUpdatedUser = async (updated: AdminUserRecord) => {
    setUsers((current) => upsertUser(current, updated));
    setDrafts((current) => ({ ...current, [updated.email]: toDraft(updated) }));
    setGrantDrafts((current) => ({
      ...current,
      [updated.email]: current[updated.email] ?? defaultGrantDraft(updated),
    }));
    await onRefreshSession();
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    setError("");
    try {
      const created = await createAdminUser({
        email: createDraft.email.trim(),
        password: createDraft.password,
        displayName: createDraft.displayName.trim() || undefined,
        role: createDraft.role,
        subscriptionStatus: createDraft.subscriptionStatus,
        isUnlimited: createDraft.isUnlimited,
      });
      await syncUpdatedUser(created);
      setCreateDraft({
        email: "",
        password: "",
        displayName: "",
        role: "user",
        subscriptionStatus: "active",
        isUnlimited: false,
      });
      setMessage(`User ${created.email} berhasil dibuat.`);
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const onSave = async (email: string) => {
    const draft = drafts[email];
    if (!draft) {
      return;
    }
    setSavingEmail(email);
    setMessage("");
    setError("");
    try {
      const updated = await updateAdminUser(email, {
        displayName: draft.displayName,
        role: draft.role,
        subscriptionStatus: draft.subscriptionStatus,
        isUnlimited: draft.isUnlimited,
        disabled: draft.disabled,
        disabledReason: draft.disabledReason.trim() || undefined,
        assignedPackageCode: draft.assignedPackageCode || null,
      });
      await syncUpdatedUser(updated);
      setMessage(`User ${email} berhasil diperbarui.`);
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSavingEmail(null);
    }
  };

  const onToggleDisabled = async (user: AdminUserRecord) => {
    setSavingEmail(user.email);
    setMessage("");
    setError("");
    try {
      const updated = user.disabledAt
        ? await updateAdminUser(user.email, { disabled: false, subscriptionStatus: "active" })
        : await disableAdminUser(user.email);
      await syncUpdatedUser(updated);
      setMessage(user.disabledAt ? `User ${user.email} aktif kembali.` : `User ${user.email} dinonaktifkan.`);
    } catch (toggleError) {
      setError((toggleError as Error).message);
    } finally {
      setSavingEmail(null);
    }
  };

  const onGrantPackage = async (email: string) => {
    const draft = grantDrafts[email];
    if (!draft) {
      return;
    }
    setGrantingEmail(email);
    setMessage("");
    setError("");
    try {
      const updated = await grantAdminUserPackage(email, {
        packageCode: draft.packageCode,
        customAmountIdr: draft.packageCode === "custom" ? draft.customAmountIdr : undefined,
        description: draft.description.trim() || undefined,
      });
      await syncUpdatedUser(updated);
      setMessage(`Saldo ${email} berhasil ditambahkan.`);
    } catch (grantError) {
      setError((grantError as Error).message);
    } finally {
      setGrantingEmail(null);
    }
  };

  if (loading) {
    return (
      <section className="card">
        <h2>Kelola User</h2>
        <p>Memuat daftar user...</p>
      </section>
    );
  }

  return (
    <section className="card app-page-card">
      <div className="section-heading compact">
        <span className="eyebrow">Superadmin</span>
        <h2>Kelola user, akses, dan paket saldo</h2>
        <p className="section-note">
          Buat user baru, ubah akses, nonaktifkan akun, atau tambahkan paket saldo tanpa membuat
          invoice pembayaran.
        </p>
      </div>

      <form className="notice-box grid-form" onSubmit={onCreate}>
        <div className="row-head">
          <strong>Buat user baru</strong>
          <UserPlus size={18} />
        </div>
        <div className="form-grid-2">
          <label>
            Email
            <input
              type="email"
              value={createDraft.email}
              onChange={(event) => setCreateDraft({ ...createDraft, email: event.target.value })}
              disabled={creating}
              placeholder="user@email.com"
            />
          </label>
          <label>
            Password Awal
            <input
              type="password"
              value={createDraft.password}
              onChange={(event) => setCreateDraft({ ...createDraft, password: event.target.value })}
              disabled={creating}
              placeholder="Minimal 8 karakter"
            />
          </label>
        </div>
        <div className="form-grid-2">
          <label>
            Nama
            <input
              value={createDraft.displayName}
              onChange={(event) => setCreateDraft({ ...createDraft, displayName: event.target.value })}
              disabled={creating}
              placeholder="Nama user"
            />
          </label>
          <label>
            Role
            <select
              value={createDraft.role}
              onChange={(event) => setCreateDraft({ ...createDraft, role: event.target.value as UserRole })}
              disabled={creating}
            >
              <option value="user">User</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </label>
        </div>
        <label>
          <span>
            <input
              type="checkbox"
              checked={createDraft.isUnlimited}
              onChange={(event) => setCreateDraft({ ...createDraft, isUnlimited: event.target.checked })}
              disabled={creating}
            />{" "}
            Saldo unlimited
          </span>
        </label>
        <button type="submit" className="primary-button" disabled={creating}>
          <UserPlus size={16} />
          <span>{creating ? "Membuat user..." : "Buat User"}</span>
        </button>
      </form>

      <div className="admin-user-grid">
        {users.map((user) => {
          const draft = drafts[user.email] ?? toDraft(user);
          const grantDraft = grantDrafts[user.email] ?? defaultGrantDraft(user);
          const balanceLabel = user.isUnlimited
            ? "Saldo Unlimited"
            : `${formatRupiah(user.walletBalanceIdr)} (${user.generateCreditsRemaining ?? 0} video)`;

          return (
            <article className="admin-user-card" key={user.email}>
              <div className="row-head">
                <div>
                  <strong>{user.displayName}</strong>
                  <p className="small break-anywhere">{user.email}</p>
                </div>
                <span className={user.disabledAt ? "status status-failed" : "status status-success"}>
                  {user.disabledAt ? "Nonaktif" : user.role}
                </span>
              </div>

              <div className="meta-grid">
                <div className="meta-card">
                  <span className="small">Login Google</span>
                  <strong>{user.googleLinked ? "Terhubung" : "Belum"}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">Password</span>
                  <strong>{user.hasPassword ? "Ada" : "Tidak ada"}</strong>
                </div>
                <div className="meta-card">
                  <span className="small">Saldo</span>
                  <strong>{balanceLabel}</strong>
                </div>
              </div>

              <div className="grid-form">
                <div className="form-grid-2">
                  <label>
                    Nama
                    <input
                      value={draft.displayName}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.email]: { ...draft, displayName: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Role
                    <select
                      value={draft.role}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.email]: { ...draft, role: event.target.value as UserRole },
                        }))
                      }
                    >
                      <option value="user">User</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                  </label>
                </div>

                <div className="form-grid-2">
                  <label>
                    Status
                    <select
                      value={draft.subscriptionStatus}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.email]: {
                            ...draft,
                            subscriptionStatus: event.target.value as "active" | "inactive",
                          },
                        }))
                      }
                    >
                      <option value="active">Aktif</option>
                      <option value="inactive">Tidak aktif</option>
                    </select>
                  </label>
                  <label>
                    Paket Terakhir
                    <select
                      value={draft.assignedPackageCode}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.email]: {
                            ...draft,
                            assignedPackageCode: event.target.value as AssignedPackageCode | "",
                          },
                        }))
                      }
                    >
                      <option value="">Belum ada</option>
                      <option value="10_video">10 video</option>
                      <option value="50_video">50 video</option>
                      <option value="100_video">100 video</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                </div>

                <label>
                  <span>
                    <input
                      type="checkbox"
                      checked={draft.isUnlimited}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.email]: { ...draft, isUnlimited: event.target.checked },
                        }))
                      }
                    />{" "}
                    Saldo unlimited
                  </span>
                </label>

                {draft.disabled ? (
                  <label>
                    Alasan Nonaktif
                    <input
                      value={draft.disabledReason}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.email]: { ...draft, disabledReason: event.target.value },
                        }))
                      }
                    />
                  </label>
                ) : null}

                <div className="form-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={savingEmail === user.email}
                    onClick={() => void onSave(user.email)}
                  >
                    <Save size={16} />
                    <span>{savingEmail === user.email ? "Menyimpan..." : "Simpan User"}</span>
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={savingEmail === user.email}
                    onClick={() => void onToggleDisabled(user)}
                  >
                    <Ban size={16} />
                    <span>{user.disabledAt ? "Aktifkan User" : "Nonaktifkan User"}</span>
                  </button>
                </div>
              </div>

              <div className="section-divider grid-form">
                <div className="row-head">
                  <strong>Assign paket / saldo</strong>
                  <Gift size={18} />
                </div>
                <div className="form-grid-2">
                  <label>
                    Paket
                    <select
                      value={grantDraft.packageCode}
                      onChange={(event) =>
                        setGrantDrafts((current) => ({
                          ...current,
                          [user.email]: {
                            ...grantDraft,
                            packageCode: event.target.value as AssignedPackageCode,
                          },
                        }))
                      }
                    >
                      {(Object.keys(PACKAGE_LABEL) as AssignedPackageCode[]).map((packageCode) => (
                        <option key={packageCode} value={packageCode}>
                          {PACKAGE_LABEL[packageCode]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Nominal Saldo
                    <input
                      type="number"
                      min={1000}
                      value={
                        grantDraft.packageCode === "custom"
                          ? grantDraft.customAmountIdr
                          : PACKAGE_CREDIT[grantDraft.packageCode]
                      }
                      disabled={grantDraft.packageCode !== "custom"}
                      onChange={(event) =>
                        setGrantDrafts((current) => ({
                          ...current,
                          [user.email]: {
                            ...grantDraft,
                            customAmountIdr: Number(event.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                </div>
                <label>
                  Catatan Opsional
                  <input
                    value={grantDraft.description}
                    onChange={(event) =>
                      setGrantDrafts((current) => ({
                        ...current,
                        [user.email]: { ...grantDraft, description: event.target.value },
                      }))
                    }
                    placeholder="Contoh: bonus kompensasi"
                  />
                </label>
                <button
                  type="button"
                  className="primary-button"
                  disabled={grantingEmail === user.email}
                  onClick={() => void onGrantPackage(user.email)}
                >
                  <ShieldUser size={16} />
                  <span>{grantingEmail === user.email ? "Menambahkan..." : "Tambahkan Saldo"}</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {message ? <p className="ok-text">{message}</p> : null}
      {error ? <p className="err-text">{error}</p> : null}
    </section>
  );
}
