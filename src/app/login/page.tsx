import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import styles from "./login.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect("/overtime");
  const { error } = await searchParams;
  return (
    <main className={styles.page}>
      <section className={styles.intro}>
        <div className={styles.logo}>TFOMS Time</div>
        <div>
          <p>Рабочее время — без таблиц и пересылок</p>
          <h1>Пять минут, чтобы всё было учтено.</h1>
          <p>
            Отмечайте внеурочное время и планируйте отпуск в одном спокойном и
            понятном пространстве.
          </p>
        </div>
      </section>
      <section className={styles.formSide}>
        <form className={styles.form} action="/api/auth/login" method="post">
          <h2>Вход</h2>
          <p className={styles.hint}>
            Используйте корпоративный логин. После подключения SSO форма будет
            заменена единым входом.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              Неверный логин или пароль
            </p>
          )}
          <label className={styles.field}>
            Логин
            <input name="login" autoComplete="username" required />
          </label>
          <label className={styles.field}>
            Пароль
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className={styles.button}>Войти</button>
        </form>
      </section>
    </main>
  );
}
