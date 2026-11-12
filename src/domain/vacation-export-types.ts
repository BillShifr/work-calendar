export type VacationExportEmployee = {
  userId: string;
  fullName: string;
  departmentId: string | null;
  departmentName: string | null;
  jobTitle: string | null;
  periods: Array<{ startsOn: string; endsOn: string }>;
};
