export type VacationBoardRow = {
  userId: string;
  fullName: string;
  planId: string | null;
  status: string;
  allowanceDays: number;
  usedDays: number;
  periodCount: number;
  periods: Array<{ startsOn: string; endsOn: string; days: number }>;
};

export function vacationBoardStatusLabel(status: string) {
  switch (status) {
    case "missing":
      return "Не начат";
    case "draft":
    case "reopened":
    case "withdrawn":
    case "rejected":
      return "Черновик";
    case "manager_review":
      return "На проверке";
    case "submitted":
      return "В кадрах";
    case "hr_proposed":
      return "Правка кадров";
    case "approved":
      return "Утверждён";
    default:
      return status;
  }
}
