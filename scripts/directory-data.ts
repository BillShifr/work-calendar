export type DepartmentSeed = {
  code: string;
  name: string;
  headcount: number;
  parentCode?: string;
};

export type JobTitleSeed = {
  name: string;
  irregularLeaveMaxDays: number;
};

export const ORGANIZATION_NAME = "ТФОМС Югры";

export const DEPARTMENT_DIRECTORY: DepartmentSeed[] = [
  { code: "central.leadership", name: "Руководство", headcount: 4 },
  {
    code: "central.accounting",
    name: "Отдел бухгалтерского учета и отчетности",
    headcount: 4,
  },
  {
    code: "central.finance",
    name: "Финансово-экономическое управление",
    headcount: 15,
  },
  {
    code: "central.finance.budget",
    parentCode: "central.finance",
    name: "Отдел бюджетно-сметного планирования и организации исполнения бюджета",
    headcount: 6,
  },
  {
    code: "central.finance.funds",
    parentCode: "central.finance",
    name: "Отдел формирования финансовых средств и статистической отчетности",
    headcount: 4,
  },
  {
    code: "central.finance.tariffs",
    parentCode: "central.finance",
    name: "Отдел формирования тарифов и экономического обоснования территориальной программы обязательного медицинского страхования",
    headcount: 4,
  },
  {
    code: "central.audit",
    name: "Контрольно-ревизионный отдел",
    headcount: 6,
  },
  {
    code: "central.security",
    name: "Отдел информационной безопасности",
    headcount: 2,
  },
  {
    code: "central.information",
    name: "Управление информационно-аналитического обеспечения",
    headcount: 7,
  },
  {
    code: "central.information.software",
    parentCode: "central.information",
    name: "Отдел информационного сопровождения и программного обеспечения",
    headcount: 2,
  },
  {
    code: "central.information.infrastructure",
    parentCode: "central.information",
    name: "Отдел информационно-технического обеспечения",
    headcount: 3,
  },
  {
    code: "central.oms",
    name: "Управление организации обязательного медицинского страхования",
    headcount: 13,
  },
  {
    code: "central.oms.rights",
    parentCode: "central.oms",
    name: "Отдел защиты прав граждан и формирования территориальной программы обязательного медицинского страхования",
    headcount: 4,
  },
  {
    code: "central.oms.quality",
    parentCode: "central.oms",
    name: "Отдел контроля объема и качества медицинской помощи",
    headcount: 3,
  },
  {
    code: "central.oms.projects",
    parentCode: "central.oms",
    name: "Отдел межтерриториальных расчетов и сопровождения проектов",
    headcount: 5,
  },
  {
    code: "central.legal",
    name: "Управление правового и кадрового обеспечения",
    headcount: 12,
  },
  {
    code: "central.legal.law",
    parentCode: "central.legal",
    name: "Юридический отдел",
    headcount: 3,
  },
  {
    code: "central.legal.contracts",
    parentCode: "central.legal",
    name: "Отдел договорной и претензионной работы",
    headcount: 5,
  },
  {
    code: "central.legal.hr",
    parentCode: "central.legal",
    name: "Отдел кадров",
    headcount: 3,
  },
  { code: "central.affairs", name: "Управление делами", headcount: 12 },
  {
    code: "central.affairs.general",
    parentCode: "central.affairs",
    name: "Общий отдел",
    headcount: 5,
  },
  {
    code: "central.affairs.procurement",
    parentCode: "central.affairs",
    name: "Отдел организации и проведения закупок",
    headcount: 4,
  },
  {
    code: "central.affairs.operations",
    parentCode: "central.affairs",
    name: "Административно-хозяйственный отдел",
    headcount: 3,
  },
  {
    code: "branch.surgut",
    name: "Филиал ТФОМС Югры в городе Сургуте",
    headcount: 19,
  },
  {
    code: "branch.surgut.leadership",
    parentCode: "branch.surgut",
    name: "Руководство",
    headcount: 2,
  },
  {
    code: "branch.surgut.quality",
    parentCode: "branch.surgut",
    name: "Отдел защиты прав граждан и контроля качества медицинской помощи",
    headcount: 4,
  },
  {
    code: "branch.nizhnevartovsk",
    name: "Филиал ТФОМС Югры в городе Нижневартовске",
    headcount: 21,
  },
  {
    code: "branch.nizhnevartovsk.leadership",
    parentCode: "branch.nizhnevartovsk",
    name: "Руководство",
    headcount: 3,
  },
  {
    code: "branch.nizhnevartovsk.quality",
    parentCode: "branch.nizhnevartovsk",
    name: "Отдел защиты прав граждан и контроля качества медицинской помощи",
    headcount: 6,
  },
  {
    code: "branch.nyagan",
    name: "Филиал ТФОМС Югры в городе Нягани",
    headcount: 7,
  },
  {
    code: "branch.nyagan.leadership",
    parentCode: "branch.nyagan",
    name: "Руководство",
    headcount: 1,
  },
];

export const JOB_TITLE_DIRECTORY: JobTitleSeed[] = [
  { name: "Первый заместитель", irregularLeaveMaxDays: 11 },
  { name: "Заместитель", irregularLeaveMaxDays: 11 },
  { name: "Главный бухгалтер", irregularLeaveMaxDays: 11 },
  { name: "Помощник директора", irregularLeaveMaxDays: 10 },
  {
    name: "Заместитель главного бухгалтера — начальник отдела",
    irregularLeaveMaxDays: 10,
  },
  { name: "Начальник управления", irregularLeaveMaxDays: 11 },
  { name: "Заместитель начальника управления", irregularLeaveMaxDays: 10 },
  { name: "Начальник отдела", irregularLeaveMaxDays: 10 },
  { name: "Заместитель начальника отдела", irregularLeaveMaxDays: 10 },
  { name: "Директор", irregularLeaveMaxDays: 11 },
  { name: "Заместитель директора", irregularLeaveMaxDays: 11 },
  { name: "Консультант", irregularLeaveMaxDays: 10 },
  { name: "Консультант в г. Урае", irregularLeaveMaxDays: 10 },
  { name: "Консультант (врач-эксперт)", irregularLeaveMaxDays: 10 },
  { name: "Консультант (юрисконсульт)", irregularLeaveMaxDays: 10 },
  {
    name: "Консультант по информационным технологиям",
    irregularLeaveMaxDays: 10,
  },
  { name: "Главный специалист", irregularLeaveMaxDays: 9 },
  {
    name: "Главный специалист по информационным технологиям",
    irregularLeaveMaxDays: 9,
  },
  {
    name: "Главный специалист (специалист по охране труда)",
    irregularLeaveMaxDays: 9,
  },
  { name: "Ведущий специалист", irregularLeaveMaxDays: 9 },
  {
    name: "Ведущий специалист по информационным технологиям",
    irregularLeaveMaxDays: 9,
  },
];
