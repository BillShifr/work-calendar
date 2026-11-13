"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  getAppNavGroups,
  isNavActive,
  isNavSectionActive,
} from "./AppNavigation";
import styles from "./AppHeader.module.css";

const spring = { type: "spring" as const, stiffness: 420, damping: 34 };

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "HR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function roleLabel(isHr: boolean, canApprove: boolean) {
  if (isHr) return "Кадровая служба";
  if (canApprove) return "Руководитель подразделения";
  return "Сотрудник";
}

export function AppHeader({
  fullName,
  isHr,
  canApprove,
}: {
  fullName: string;
  isHr: boolean;
  canApprove: boolean;
}) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const groups = getAppNavGroups(isHr, canApprove);
  const activeGroup =
    groups.find((group) => isNavSectionActive(pathname, group)) ?? null;
  const fanChildren = activeGroup?.children ?? [];

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link className={styles.brand} href="/overtime">
          <span className={styles.brandMark} aria-hidden="true">
            T
          </span>
          <span>HR</span>
        </Link>
        <nav className={styles.nav} aria-label="Основная навигация">
          <div className={styles.deck}>
            {groups.map((group, index) => {
              const primaryActive = isNavActive(pathname, group.primary);
              const sectionActive = isNavSectionActive(pathname, group);
              return (
                <motion.div
                  className={styles.plateSlot}
                  key={group.id}
                  style={{ zIndex: sectionActive ? 8 : index }}
                  animate={
                    reduceMotion
                      ? { y: 0, scale: 1, rotateX: 0 }
                      : {
                          y: sectionActive ? -8 : 0,
                          rotateX: sectionActive ? 0 : 8,
                          scale: sectionActive ? 1.04 : 1,
                        }
                  }
                  whileHover={
                    reduceMotion ? undefined : { y: sectionActive ? -10 : -5 }
                  }
                  transition={spring}
                >
                  <Link
                    href={group.primary.href}
                    aria-current={primaryActive ? "page" : undefined}
                    className={styles.plate}
                    data-active={sectionActive}
                  >
                    {group.primary.label}
                  </Link>
                </motion.div>
              );
            })}
          </div>
          <AnimatePresence initial={false}>
            {fanChildren.length > 0 ? (
              <motion.div
                key={activeGroup?.id}
                className={styles.fan}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              >
                {fanChildren.map((child, index) => {
                  const active = isNavActive(pathname, child);
                  return (
                    <motion.div
                      key={child.href}
                      initial={
                        reduceMotion ? false : { opacity: 0, rotate: -6, y: -8 }
                      }
                      animate={{ opacity: 1, rotate: 0, y: 0 }}
                      transition={{ ...spring, delay: index * 0.05 }}
                    >
                      <Link
                        href={child.href}
                        aria-current={active ? "page" : undefined}
                        className={styles.fanPlate}
                      >
                        {child.label}
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </nav>
        <div className={styles.user}>
          <span className={styles.avatar} aria-hidden="true">
            {initials(fullName)}
          </span>
          <span className={styles.userMeta}>
            <strong>{fullName}</strong>
            <span>{roleLabel(isHr, canApprove)}</span>
          </span>
          <form action="/api/auth/logout" method="post">
            <button className={styles.logout} type="submit">
              Выйти
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
