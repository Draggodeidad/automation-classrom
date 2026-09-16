# Scheduling

La instancia y el workflow fijan `America/Mexico_City` mediante `GENERIC_TIMEZONE`, `TZ` y `settings.timezone`.

| Ruta | Cron | Primera consulta | Retry máximo |
|---|---|---:|---:|
| PWA | `10 9 * * 1` | lunes 09:10 | lunes 09:40 |
| DMI | `10 9 * * 2` | martes 09:10 | martes 09:40 |

Cada trigger crea una ruta con una sola materia. `Route PWA` nunca puede usar el ID de DMI y `Route DMI` nunca puede usar el ID de PWA.

Si la primera consulta no devuelve una actividad publicada, semanal, no-quiz y reciente, el nodo `Wait 30 Minutes Once` espera 30 minutos. `Increment Retry` exige `attempt === 1`, lo cambia a `2` y permite una segunda consulta. Si tampoco hay actividad, genera una alerta opcional y termina. No existe conexión de vuelta al Wait.

El Manual Trigger no cambia estos horarios. Para backfill edita `Manual Request`:

```js
const request = { course: 'DMI', week: 3 };
```

En ejecución manual, la semana explícita desactiva el filtro de antigüedad de 36 horas.
