import * as XLSX from "xlsx";
import type { AdminUserRecord } from "./types";

interface ExportAdminUsersWorkbookInput {
  filteredUsers: AdminUserRecord[];
  allUsers: AdminUserRecord[];
  fileName?: string;
}

const EXPORT_COLUMNS = [
  "id",
  "displayName",
  "email",
  "role",
  "accountStatus",
  "subscriptionStatus",
  "googleLinked",
  "hasPassword",
  "isUnlimited",
  "walletBalanceIdr",
  "generatePriceIdr",
  "generateCreditsRemaining",
  "videoQuotaTotal",
  "videoQuotaUsed",
  "videoQuotaRemaining",
  "assignedPackageCode",
  "disabledAt",
  "disabledReason",
  "createdAt",
  "updatedAt",
] as const;

function toExportRow(user: AdminUserRecord) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    accountStatus: user.disabledAt ? "disabled" : "active",
    subscriptionStatus: user.subscriptionStatus,
    googleLinked: user.googleLinked,
    hasPassword: user.hasPassword,
    isUnlimited: user.isUnlimited,
    walletBalanceIdr: user.walletBalanceIdr,
    generatePriceIdr: user.generatePriceIdr,
    generateCreditsRemaining: user.generateCreditsRemaining,
    videoQuotaTotal: user.videoQuotaTotal,
    videoQuotaUsed: user.videoQuotaUsed,
    videoQuotaRemaining: user.videoQuotaRemaining,
    assignedPackageCode: user.assignedPackageCode,
    disabledAt: user.disabledAt,
    disabledReason: user.disabledReason,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function createSheet(rows: AdminUserRecord[]) {
  const sheet = XLSX.utils.json_to_sheet(rows.map(toExportRow), {
    header: [...EXPORT_COLUMNS],
  });
  sheet["!cols"] = EXPORT_COLUMNS.map((column) => ({
    wch: Math.max(column.length + 2, 16),
  }));
  return sheet;
}

function buildDefaultFileName(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `admin-users-${year}-${month}-${day}.xlsx`;
}

export function exportAdminUsersWorkbook(input: ExportAdminUsersWorkbookInput) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, createSheet(input.filteredUsers), "Filtered Users");
  XLSX.utils.book_append_sheet(workbook, createSheet(input.allUsers), "All Users");
  XLSX.writeFile(workbook, input.fileName ?? buildDefaultFileName());
}
