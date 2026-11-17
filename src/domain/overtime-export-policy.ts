export function shouldExportOvertimeMinutes(input: {
  reportStatus: string;
  monthApproved: boolean;
}) {
  if (!["submitted", "hr_proposed", "approved"].includes(input.reportStatus)) {
    return false;
  }
  return input.monthApproved || input.reportStatus === "approved";
}
