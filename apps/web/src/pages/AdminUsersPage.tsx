import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Ban,
  Download,
  Gift,
  ListFilter,
  ReceiptText,
  RotateCcw,
  Save,
  Search,
  ShieldUser,
  UserPlus,
  Users,
} from "lucide-react";
import { exportAdminUsersWorkbook } from "../admin-users-export";
import {
  createAdminUser,
  disableAdminUser,
  fetchAdminTransactions,
  fetchAdminUsers,
  grantAdminUserPackage,
  updateAdminUser,
} from "../api";
import type {
  AdminTransactionRecord,
  AdminUserRecord,
  AssignedPackageCode,
  UserRole,
} from "../types";

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

type AdminSection = "users" | "transactions";
type TransactionFilter = "all" | "payment" | "generate" | "refund" | "admin";
type UserDetailMode = "edit" | "create";
type UserRoleFilter = "all" | UserRole;
type AccountStatusFilter = "all" | "active" | "disabled";
type SubscriptionFilter = "all" | "active" | "inactive";
type ConnectionFilter = "all" | "connected" | "unconnected";
type PasswordFilter = "all" | "set" | "unset";
type BalanceFilter = "all" | "unlimited" | "regular";
type PackageFilter = "all" | "none" | AssignedPackageCode;
type UserSort = "name_asc" | "name_desc" | "email_asc" | "balance_desc" | "updated_desc";

interface UserFilters {
  query: string;
  role: UserRoleFilter;
  accountStatus: AccountStatusFilter;
  subscriptionStatus: SubscriptionFilter;
  googleLinked: ConnectionFilter;
  hasPassword: PasswordFilter;
  balanceType: BalanceFilter;
  packageCode: PackageFilter;
  sortBy: UserSort;
}

const PACKAGE_LABEL: Record<AssignedPackageCode, string> = {
  "10_video": "10 generate",
  "50_video": "50 generate",
  "100_video": "100 generate",
  custom: "Custom",
};

const PACKAGE_CREDIT: Record<Exclude<AssignedPackageCode, "custom">, number> = {
  "10_video": 20_000,
  "50_video": 100_000,
  "100_video": 200_000,
};

const FILTER_LABEL: Record<TransactionFilter, string> = {
  all: "Semua",
  payment: "Pembayaran",
  generate: "Generate",
  refund: "Refund",
  admin: "Admin",
};

const KIND_LABEL: Record<AdminTransactionRecord["kind"], string> = {
  payment: "Pembayaran",
  generate: "Generate",
  refund: "Refund",
  admin: "Admin",
};

const USER_SORT_LABEL: Record<UserSort, string> = {
  name_asc: "Nama A-Z",
  name_desc: "Nama Z-A",
  email_asc: "Email A-Z",
  balance_desc: "Saldo tertinggi",
  updated_desc: "Terbaru diupdate",
};

const DEFAULT_USER_FILTERS: UserFilters = {
  query: "",
  role: "all",
  accountStatus: "all",
  subscriptionStatus: "all",
  googleLinked: "all",
  hasPassword: "all",
  balanceType: "all",
  packageCode: "all",
  sortBy: "updated_desc",
};

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function getAccountStatus(user: AdminUserRecord): "active" | "disabled" {
  return user.disabledAt ? "disabled" : "active";
}

function getPackageValue(user: AdminUserRecord): PackageFilter {
  return user.assignedPackageCode ?? "none";
}

function describeBalance(user: AdminUserRecord): string {
  return user.isUnlimited
    ? "Saldo Unlimited"
    : `${formatRupiah(user.walletBalanceIdr)} (${user.generateCreditsRemaining ?? 0} generate)`;
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

function mapTransactionStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Menunggu";
    case "paid":
      return "Lunas";
    case "expired":
      return "Expired";
    case "failed":
      return "Gagal";
    case "canceled":
      return "Batal";
    case "posted":
      return "Tercatat";
    default:
      return status;
  }
}

function mapTransactionStatusClass(status: string): string {
  if (status === "paid" || status === "posted") {
    return "status status-success";
  }
  if (status === "pending") {
    return "status status-warning";
  }
  return "status status-failed";
}

function filterTransactions(items: AdminTransactionRecord[], filter: TransactionFilter) {
  if (filter === "all") {
    return items;
  }
  return items.filter((item) => item.kind === filter);
}

function matchesUserFilters(user: AdminUserRecord, filters: UserFilters): boolean {
  const query = normalizeSearchText(filters.query);
  if (query) {
    const haystack = `${user.displayName} ${user.email}`.toLowerCase();
    if (!haystack.includes(query)) {
      return false;
    }
  }

  if (filters.role !== "all" && user.role !== filters.role) {
    return false;
  }
  if (filters.accountStatus !== "all" && getAccountStatus(user) !== filters.accountStatus) {
    return false;
  }
  if (filters.subscriptionStatus !== "all" && user.subscriptionStatus !== filters.subscriptionStatus) {
    return false;
  }
  if (filters.googleLinked !== "all") {
    const googleLinked = filters.googleLinked === "connected";
    if (user.googleLinked !== googleLinked) {
      return false;
    }
  }
  if (filters.hasPassword !== "all") {
    const hasPassword = filters.hasPassword === "set";
    if (user.hasPassword !== hasPassword) {
      return false;
    }
  }
  if (filters.balanceType !== "all") {
    const isUnlimited = filters.balanceType === "unlimited";
    if (user.isUnlimited !== isUnlimited) {
      return false;
    }
  }
  if (filters.packageCode !== "all" && getPackageValue(user) !== filters.packageCode) {
    return false;
  }
  return true;
}

function sortUsers(users: AdminUserRecord[], sortBy: UserSort): AdminUserRecord[] {
  const result = [...users];
  result.sort((left, right) => {
    switch (sortBy) {
      case "name_asc":
        return left.displayName.localeCompare(right.displayName, "id-ID");
      case "name_desc":
        return right.displayName.localeCompare(left.displayName, "id-ID");
      case "email_asc":
        return left.email.localeCompare(right.email, "id-ID");
      case "balance_desc":
        return right.walletBalanceIdr - left.walletBalanceIdr || left.email.localeCompare(right.email, "id-ID");
      case "updated_desc":
      default:
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }
  });
  return result;
}

function countActiveUserFilters(filters: UserFilters): number {
  return Object.entries(filters).reduce((count, [key, value]) => {
    if (key === "sortBy") {
      return value === DEFAULT_USER_FILTERS.sortBy ? count : count + 1;
    }
    if (typeof value === "string") {
      const defaultValue = DEFAULT_USER_FILTERS[key as keyof UserFilters];
      return value === defaultValue ? count : count + 1;
    }
    return count;
  }, 0);
}

export function AdminUsersPage({ onRefreshSession }: AdminUsersPageProps) {
  const [activeSection, setActiveSection] = useState<AdminSection>("users");
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>("all");
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [grantDrafts, setGrantDrafts] = useState<Record<string, GrantDraft>>({});
  const [transactions, setTransactions] = useState<AdminTransactionRecord[]>([]);
  const [transactionCursor, setTransactionCursor] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<UserDetailMode>("edit");
  const [userFilters, setUserFilters] = useState<UserFilters>(DEFAULT_USER_FILTERS);
  const [createDraft, setCreateDraft] = useState({
    email: "",
    password: "",
    displayName: "",
    role: "user" as UserRole,
    subscriptionStatus: "active" as "active" | "inactive",
    isUnlimited: false,
  });
  const [loading, setLoading] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
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
        const [usersResult, transactionResult] = await Promise.all([
          fetchAdminUsers(),
          fetchAdminTransactions(),
        ]);
        if (!mounted) {
          return;
        }
        hydrateUsers(usersResult);
        setTransactions(transactionResult.items);
        setTransactionCursor(transactionResult.nextCursor);
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

  useEffect(() => {
    if (detailMode === "create") {
      return;
    }
    if (users.length === 0) {
      setSelectedEmail(null);
      return;
    }
    setSelectedEmail((current) => {
      if (current && users.some((user) => user.email === current)) {
        return current;
      }
      return users[0]?.email ?? null;
    });
  }, [detailMode, users]);

  const selectedUser = useMemo(
    () => users.find((user) => user.email === selectedEmail) ?? null,
    [selectedEmail, users]
  );

  const visibleUsers = useMemo(() => {
    return sortUsers(
      users.filter((user) => matchesUserFilters(user, userFilters)),
      userFilters.sortBy
    );
  }, [userFilters, users]);

  const visibleTransactions = useMemo(
    () => filterTransactions(transactions, transactionFilter),
    [transactionFilter, transactions]
  );

  const activeFilterCount = useMemo(() => countActiveUserFilters(userFilters), [userFilters]);

  const syncUpdatedUser = async (updated: AdminUserRecord) => {
    setUsers((current) => upsertUser(current, updated));
    setDrafts((current) => ({ ...current, [updated.email]: toDraft(updated) }));
    setGrantDrafts((current) => ({
      ...current,
      [updated.email]: current[updated.email] ?? defaultGrantDraft(updated),
    }));
    setSelectedEmail(updated.email);
    setDetailMode("edit");
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

  const onLoadMoreTransactions = async () => {
    if (!transactionCursor) {
      return;
    }
    setLoadingTransactions(true);
    setMessage("");
    setError("");
    try {
      const nextPage = await fetchAdminTransactions({ cursor: transactionCursor });
      setTransactions((current) => [...current, ...nextPage.items]);
      setTransactionCursor(nextPage.nextCursor);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const onResetFilters = () => {
    setUserFilters(DEFAULT_USER_FILTERS);
  };

  const onSelectUser = (email: string) => {
    setSelectedEmail(email);
    setDetailMode("edit");
    setMessage("");
    setError("");
  };

  const onOpenCreateUser = () => {
    setDetailMode("create");
    setMessage("");
    setError("");
  };

  const onExportUsers = () => {
    try {
      exportAdminUsersWorkbook({
        filteredUsers: visibleUsers,
        allUsers: users,
      });
      setMessage("Export Excel user berhasil dibuat.");
      setError("");
    } catch (exportError) {
      setError((exportError as Error).message);
    }
  };

  if (loading) {
    return (
      <section className="card">
        <h2>Kelola User</h2>
        <p>Memuat data superadmin...</p>
      </section>
    );
  }

  return (
    <section className="card app-page-card">
      <div className="section-heading compact">
        <span className="eyebrow">Superadmin</span>
        <h2>Kelola user, akses, paket saldo, dan audit transaksi</h2>
        <p className="section-note">
          Gunakan tab user untuk operasional akun, lalu buka tab transaksi untuk audit invoice,
          mutasi saldo, refund, dan penyesuaian admin dalam satu feed.
        </p>
      </div>

      <div className="tab-pill admin-section-tabs">
        <button
          type="button"
          className={activeSection === "users" ? "active" : ""}
          onClick={() => setActiveSection("users")}
        >
          <Users size={16} />
          <span>User</span>
        </button>
        <button
          type="button"
          className={activeSection === "transactions" ? "active" : ""}
          onClick={() => setActiveSection("transactions")}
        >
          <ReceiptText size={16} />
          <span>Transaksi</span>
        </button>
      </div>

      {message ? <p className="ok-text">{message}</p> : null}
      {error ? <p className="err-text">{error}</p> : null}

      {activeSection === "users" ? (
        <div className="admin-users-layout">
          <aside className="notice-box grid-form admin-users-sidebar" aria-label="List user admin">
            <div className="admin-users-toolbar">
              <label className="admin-search-field">
                <span className="small">Cari user</span>
                <div className="admin-search-input-wrap">
                  <Search size={16} />
                  <input
                    aria-label="Cari user"
                    value={userFilters.query}
                    onChange={(event) =>
                      setUserFilters((current) => ({ ...current, query: event.target.value }))
                    }
                    placeholder="Cari nama atau email"
                  />
                </div>
              </label>

              <div className="admin-users-toolbar-actions">
                <button type="button" className="secondary-button" onClick={onResetFilters}>
                  <RotateCcw size={16} />
                  <span>Reset Filter</span>
                </button>
                <button type="button" className="secondary-button" onClick={onExportUsers} disabled={!users.length}>
                  <Download size={16} />
                  <span>Export Excel</span>
                </button>
                <button type="button" className="primary-button" onClick={onOpenCreateUser}>
                  <UserPlus size={16} />
                  <span>Tambah User</span>
                </button>
              </div>
            </div>

            <div className="admin-users-filter-grid">
              <label>
                Filter role
                <select
                  aria-label="Filter role"
                  value={userFilters.role}
                  onChange={(event) =>
                    setUserFilters((current) => ({
                      ...current,
                      role: event.target.value as UserRoleFilter,
                    }))
                  }
                >
                  <option value="all">Semua role</option>
                  <option value="user">User</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </label>
              <label>
                Status akun
                <select
                  aria-label="Status akun"
                  value={userFilters.accountStatus}
                  onChange={(event) =>
                    setUserFilters((current) => ({
                      ...current,
                      accountStatus: event.target.value as AccountStatusFilter,
                    }))
                  }
                >
                  <option value="all">Semua akun</option>
                  <option value="active">Aktif</option>
                  <option value="disabled">Nonaktif</option>
                </select>
              </label>
              <label>
                Status langganan
                <select
                  aria-label="Status langganan"
                  value={userFilters.subscriptionStatus}
                  onChange={(event) =>
                    setUserFilters((current) => ({
                      ...current,
                      subscriptionStatus: event.target.value as SubscriptionFilter,
                    }))
                  }
                >
                  <option value="all">Semua langganan</option>
                  <option value="active">Aktif</option>
                  <option value="inactive">Tidak aktif</option>
                </select>
              </label>
              <label>
                Login Google
                <select
                  aria-label="Login Google"
                  value={userFilters.googleLinked}
                  onChange={(event) =>
                    setUserFilters((current) => ({
                      ...current,
                      googleLinked: event.target.value as ConnectionFilter,
                    }))
                  }
                >
                  <option value="all">Semua</option>
                  <option value="connected">Terhubung</option>
                  <option value="unconnected">Belum</option>
                </select>
              </label>
              <label>
                Password
                <select
                  aria-label="Password"
                  value={userFilters.hasPassword}
                  onChange={(event) =>
                    setUserFilters((current) => ({
                      ...current,
                      hasPassword: event.target.value as PasswordFilter,
                    }))
                  }
                >
                  <option value="all">Semua</option>
                  <option value="set">Ada</option>
                  <option value="unset">Tidak ada</option>
                </select>
              </label>
              <label>
                Tipe saldo
                <select
                  aria-label="Tipe saldo"
                  value={userFilters.balanceType}
                  onChange={(event) =>
                    setUserFilters((current) => ({
                      ...current,
                      balanceType: event.target.value as BalanceFilter,
                    }))
                  }
                >
                  <option value="all">Semua</option>
                  <option value="unlimited">Unlimited</option>
                  <option value="regular">Reguler</option>
                </select>
              </label>
              <label>
                Paket terakhir
                <select
                  aria-label="Paket terakhir"
                  value={userFilters.packageCode}
                  onChange={(event) =>
                    setUserFilters((current) => ({
                      ...current,
                      packageCode: event.target.value as PackageFilter,
                    }))
                  }
                >
                  <option value="all">Semua paket</option>
                  <option value="none">Belum ada</option>
                  <option value="10_video">10 generate</option>
                  <option value="50_video">50 generate</option>
                  <option value="100_video">100 generate</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label>
                Urutkan
                <select
                  aria-label="Urutkan"
                  value={userFilters.sortBy}
                  onChange={(event) =>
                    setUserFilters((current) => ({
                      ...current,
                      sortBy: event.target.value as UserSort,
                    }))
                  }
                >
                  {(Object.keys(USER_SORT_LABEL) as UserSort[]).map((sortBy) => (
                    <option key={sortBy} value={sortBy}>
                      {USER_SORT_LABEL[sortBy]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="admin-users-list-summary">
              <strong>{visibleUsers.length} user tampil</strong>
              <span className="small">
                {activeFilterCount ? `${activeFilterCount} filter aktif` : "Tanpa filter tambahan"}
              </span>
            </div>

            <div className="admin-user-list" role="list">
              {visibleUsers.length ? (
                visibleUsers.map((user) => (
                  <button
                    key={user.email}
                    type="button"
                    role="listitem"
                    aria-label={`Pilih user ${user.displayName}`}
                    className={[
                      "admin-user-list-item",
                      selectedEmail === user.email && detailMode === "edit" ? "selected" : "",
                      user.disabledAt ? "is-disabled" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => onSelectUser(user.email)}
                  >
                    <div className="admin-user-list-top">
                      <div>
                        <strong>{user.displayName}</strong>
                        <p className="small break-anywhere">{user.email}</p>
                      </div>
                      <div className="admin-user-list-badges">
                        <span className="status status-success">{user.role}</span>
                        <span className={user.disabledAt ? "status status-failed" : "status status-success"}>
                          {user.disabledAt ? "Nonaktif" : "Aktif"}
                        </span>
                      </div>
                    </div>

                    <div className="admin-user-list-meta">
                      <span>Google: {user.googleLinked ? "Terhubung" : "Belum"}</span>
                      <span>Password: {user.hasPassword ? "Ada" : "Tidak ada"}</span>
                    </div>

                    <div className="admin-user-list-foot">
                      <strong>{describeBalance(user)}</strong>
                      <span className="small">
                        Paket: {user.assignedPackageCode ? PACKAGE_LABEL[user.assignedPackageCode] : "Belum ada"}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="admin-user-empty">
                  <strong>Tidak ada user yang cocok</strong>
                  <p className="small">Coba longgarkan kata pencarian atau reset filter untuk melihat semua user.</p>
                </div>
              )}
            </div>
          </aside>

          <section className="notice-box grid-form admin-user-detail-panel" aria-label="Detail user admin">
            {detailMode === "create" ? (
              <form className="grid-form" onSubmit={onCreate}>
                <div className="row-head">
                  <div>
                    <strong>Buat user baru</strong>
                    <p className="small">Form ini akan membuat akun baru lalu langsung membuka detail user tersebut.</p>
                  </div>
                  {selectedUser ? (
                    <button type="button" className="secondary-button" onClick={() => setDetailMode("edit")}>
                      Kembali ke detail
                    </button>
                  ) : null}
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
                    Role user baru
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
            ) : selectedUser ? (
              (() => {
                const draft = drafts[selectedUser.email] ?? toDraft(selectedUser);
                const grantDraft = grantDrafts[selectedUser.email] ?? defaultGrantDraft(selectedUser);
                const balanceLabel = describeBalance(selectedUser);

                return (
                  <>
                    <div className="row-head">
                      <div>
                        <strong>Detail user</strong>
                        <p className="small break-anywhere">{selectedUser.email}</p>
                      </div>
                      <div className="admin-user-list-badges">
                        <span className="status status-success">{selectedUser.role}</span>
                        <span className={selectedUser.disabledAt ? "status status-failed" : "status status-success"}>
                          {selectedUser.disabledAt ? "Nonaktif" : "Aktif"}
                        </span>
                      </div>
                    </div>

                    <div className="meta-grid">
                      <div className="meta-card">
                        <span className="small">Login Google</span>
                        <strong>{selectedUser.googleLinked ? "Terhubung" : "Belum"}</strong>
                      </div>
                      <div className="meta-card">
                        <span className="small">Password</span>
                        <strong>{selectedUser.hasPassword ? "Ada" : "Tidak ada"}</strong>
                      </div>
                      <div className="meta-card">
                        <span className="small">Saldo</span>
                        <strong>{balanceLabel}</strong>
                      </div>
                    </div>

                    <div className="admin-user-detail-meta">
                      <span>Dibuat: {formatDateTime(selectedUser.createdAt)}</span>
                      <span>Diupdate: {formatDateTime(selectedUser.updatedAt)}</span>
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
                                [selectedUser.email]: { ...draft, displayName: event.target.value },
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
                                [selectedUser.email]: { ...draft, role: event.target.value as UserRole },
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
                                [selectedUser.email]: {
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
                                [selectedUser.email]: {
                                  ...draft,
                                  assignedPackageCode: event.target.value as AssignedPackageCode | "",
                                },
                              }))
                            }
                          >
                            <option value="">Belum ada</option>
                            <option value="10_video">10 generate</option>
                            <option value="50_video">50 generate</option>
                            <option value="100_video">100 generate</option>
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
                                [selectedUser.email]: { ...draft, isUnlimited: event.target.checked },
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
                                [selectedUser.email]: { ...draft, disabledReason: event.target.value },
                              }))
                            }
                          />
                        </label>
                      ) : null}

                      <div className="form-actions">
                        <button
                          type="button"
                          className="primary-button"
                          disabled={savingEmail === selectedUser.email}
                          onClick={() => void onSave(selectedUser.email)}
                        >
                          <Save size={16} />
                          <span>{savingEmail === selectedUser.email ? "Menyimpan..." : "Simpan User"}</span>
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={savingEmail === selectedUser.email}
                          onClick={() => void onToggleDisabled(selectedUser)}
                        >
                          <Ban size={16} />
                          <span>{selectedUser.disabledAt ? "Aktifkan User" : "Nonaktifkan User"}</span>
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
                                [selectedUser.email]: {
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
                                [selectedUser.email]: {
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
                              [selectedUser.email]: { ...grantDraft, description: event.target.value },
                            }))
                          }
                          placeholder="Contoh: bonus kompensasi"
                        />
                      </label>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={grantingEmail === selectedUser.email}
                        onClick={() => void onGrantPackage(selectedUser.email)}
                      >
                        <ShieldUser size={16} />
                        <span>{grantingEmail === selectedUser.email ? "Menambahkan..." : "Tambahkan Saldo"}</span>
                      </button>
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="admin-user-empty">
                <strong>Belum ada user dipilih</strong>
                <p className="small">Pilih user dari panel kiri atau buat user baru untuk mulai mengelola akun.</p>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="grid-form">
          <div className="row-head">
            <strong>Feed transaksi superadmin</strong>
            <ListFilter size={18} />
          </div>

          <div className="admin-transaction-toolbar">
            <div className="tab-pill admin-filter-tabs">
              {(Object.keys(FILTER_LABEL) as TransactionFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={transactionFilter === filter ? "active" : ""}
                  onClick={() => setTransactionFilter(filter)}
                >
                  {FILTER_LABEL[filter]}
                </button>
              ))}
            </div>
            <p className="small">Menampilkan {visibleTransactions.length} baris dari feed audit terbaru.</p>
          </div>

          <div className="admin-transaction-table-wrap">
            <table className="admin-transaction-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>User</th>
                  <th>Kategori</th>
                  <th>Status</th>
                  <th>Nominal</th>
                  <th>Dampak Saldo</th>
                  <th>Pajak %</th>
                  <th>Pajak</th>
                  <th>Bersih</th>
                  <th>Metode / Ref</th>
                  <th>Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.length ? (
                  visibleTransactions.map((transaction) => (
                    <tr key={transaction.transactionId}>
                      <td>{formatDateTime(transaction.occurredAt)}</td>
                      <td>
                        <strong>{transaction.ownerEmail}</strong>
                      </td>
                      <td>{KIND_LABEL[transaction.kind]}</td>
                      <td>
                        <span className={mapTransactionStatusClass(transaction.status)}>
                          {mapTransactionStatusLabel(transaction.status)}
                        </span>
                      </td>
                      <td>{formatRupiah(transaction.grossAmountIdr)}</td>
                      <td>{transaction.walletImpactIdr ? formatRupiah(transaction.walletImpactIdr) : "-"}</td>
                      <td>{formatPercent(transaction.taxRatePercent)}</td>
                      <td>{formatRupiah(transaction.taxAmountIdr)}</td>
                      <td>{formatRupiah(transaction.netAmountIdr)}</td>
                      <td className="break-anywhere">
                        <strong>{transaction.paymentMethod || "-"}</strong>
                        <br />
                        <span className="small">
                          {transaction.invoiceId || transaction.merchantOrderId || transaction.transactionId}
                        </span>
                      </td>
                      <td className="break-anywhere">
                        <strong>{transaction.description}</strong>
                        <br />
                        <span className="small">
                          {transaction.balanceAfterIdr === null
                            ? "Belum ada perubahan saldo."
                            : `Saldo akhir ${formatRupiah(transaction.balanceAfterIdr)}`}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="small">
                      Belum ada transaksi untuk filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {transactionCursor ? (
            <button
              type="button"
              className="secondary-button admin-load-more"
              onClick={() => void onLoadMoreTransactions()}
              disabled={loadingTransactions}
            >
              {loadingTransactions ? "Memuat..." : "Muat transaksi berikutnya"}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
