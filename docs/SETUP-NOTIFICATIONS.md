# Notificaciones opcionales

Gmail ya no es una fuente ni participa en idempotencia. Sólo puede enviar resúmenes de éxito, ausencia, error o revisión manual.

Para desactivarlo, que es el valor predeterminado:

```env
NOTIFICATIONS_ENABLED=false
```

Para activarlo:

```env
NOTIFICATIONS_ENABLED=true
NOTIFICATION_EMAIL=tu-correo@gmail.com
```

Crea una credencial Gmail OAuth2 llamada `Gmail notifications (optional)` y asígnala sólo a los nodos `Gmail - Send ...`. No se crean labels ni se leen mensajes. Si las notificaciones están desactivadas, los nodos Gmail no se ejecutan.
