import styles from "./ApprovalHistory.module.css";

export type ApprovalHistoryEvent = {
  id: string;
  fromStatus: string;
  toStatus: string;
  comment: string | null;
  createdAt: Date;
  actorName: string;
};

export function ApprovalHistory({
  events,
  emptyLabel,
  statusLabels,
}: {
  events: ApprovalHistoryEvent[];
  emptyLabel: string;
  statusLabels: Record<string, string>;
}) {
  return (
    <section className={`card ${styles.history}`}>
      <div>
        <h2>История решений</h2>
      </div>
      {events.length ? (
        <ol>
          {events.map((event) => (
            <li key={event.id}>
              <span>{event.createdAt.toLocaleString("ru-RU")}</span>
              <strong>{event.actorName}</strong>
              <p>
                {statusLabels[event.fromStatus] ?? event.fromStatus} →{" "}
                {statusLabels[event.toStatus] ?? event.toStatus}
              </p>
              {event.comment && <blockquote>{event.comment}</blockquote>}
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.empty}>{emptyLabel}</p>
      )}
    </section>
  );
}
