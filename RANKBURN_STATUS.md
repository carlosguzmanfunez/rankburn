# RANKBURN_STATUS.md

Estado del proyecto tras la integración de persistencia durable con
PostgreSQL + Drizzle ORM.

**Fecha:** 30 de agosto de 2026
**Versión:** MVP con persistencia PostgreSQL — pagos aún no conectados

---

## 0. Advertencia sobre la verificación

El entorno donde se hizo este trabajo **no tenía acceso de red**. En
consecuencia, y esto es importante:

- **`npm install` no pudo ejecutarse.** `drizzle-orm`, `postgres` y
  `drizzle-kit` están declarados en `package.json` pero **no se instalaron**.
- **`npm run build` NO fue ejecutado.**
- **No hubo ninguna base de datos PostgreSQL disponible.** El esquema, las
  migraciones y todas las consultas Drizzle **no se han ejecutado nunca contra
  un Postgres real.**

Lo que sí se hizo:

1. Se compiló todo el código con el compilador real de TypeScript usando
   declaraciones sustitutas para las dependencias. Pasa limpio. Detecta
   sintaxis, imports internos y tipos propios; **no** valida la sintaxis de
   consultas Drizzle, porque bajo los sustitutos Drizzle es `any`.
2. Se verificó numéricamente el motor de presupuesto (ver §3), que es la parte
   donde un error cuesta dinero.

**Trata la primera ejecución contra Postgres como una prueba, no como un
despliegue.** El área de mayor riesgo son las consultas Drizzle, que son
precisamente lo que no pude verificar.

Orden recomendado de verificación:

```bash
npm install
npm run typecheck        # tipos reales de Drizzle: aquí aparecerá cualquier error de consulta
npm run db:setup         # aplica el esquema
npm run dev              # arranca y prueba /api/market
```

### Corrección posterior a la entrega (auditoría de nombres de columna)

Al renombrar `hours_at_one` a `minutes_at_one` quedó un `hoursAtOne: 0` en el
insert de `campaign_stats` de `app/api/campaigns/route.ts`. Habría hecho
fallar toda alta de campaña nueva en cuanto se instalaran las dependencias.
Corregido.

Este es precisamente el punto ciego descrito arriba: con Drizzle sustituido
por `any`, los objetos `values()` y `set()` no se validan. Se añadió
`npm run audit:schema`, que compara cada literal de escritura contra las
columnas de `schema.ts` sin necesitar dependencias ni base de datos.

Auditoría completa ejecutada tras la corrección:

| Comprobación | Resultado |
|---|---|
| 34 literales `values()` / `set()` contra columnas del esquema | PASS |
| 111 referencias `tabla.columna` en `app/` y `lib/` | PASS |
| Claves del objeto `patch` dinámico de `moderation.ts` | PASS |
| Paridad columna a columna entre `0000_init.sql` y `schema.ts` | PASS |
| Lecturas `row.*` de los mapeadores de `store.ts` | PASS |

`hoursAtOne` sigue existiendo **a propósito** en la capa de dominio
(`types.ts`, `rankburn-data.ts` y la UI): la base de datos guarda minutos y
`store.ts` deriva horas enteras. No es una referencia obsoleta.

---

## 1. Decisión de arquitectura: las lecturas ahora son asíncronas

Pediste preservar las interfaces existentes. Se preservaron los **tipos de
dominio** (`lib/server/types.ts` está intacto) y la **estructura de módulos**,
pero las funciones que leen o escriben ahora devuelven `Promise`.

Esto no era evitable: PostgreSQL es asíncrono y la interfaz anterior era
síncrona (`getStore()` devolvía `Map`s). No existe forma de tener persistencia
durable manteniendo firmas síncronas. Lo que cambió son los `await`; el
comportamiento, las reglas de negocio y los contratos de datos son los mismos.

| Antes | Ahora |
|---|---|
| `getStore()` | `listCampaignBundles()`, `getCampaignBundle(id)`, … |
| `settleCampaign(id)` | `await settleCampaign(id)` |
| `getLiveRanking()` | `await getLiveRanking()` |
| `applyModeration(...)` | `await applyModeration(...)` |
| `applyVerifiedPayment(e)` | `await applyVerifiedPayment(e)` |

La UI no cambió. Ningún componente, color, layout ni mecánica de producto fue
modificado en esta etapa.

---

## 2. Qué se persiste

Todas las entidades requeridas, en PostgreSQL:

| Tabla | Contenido |
|---|---|
| `users` | anunciantes y moderadores |
| `products` | producto anunciado (slug, categoría, sitio) |
| `campaigns` | estado, flag, tasa de consumo, relojes de liquidación |
| `advertising_budgets` | saldo activo, financiado, usado, usado hoy |
| `payments` | intentos y capturas, con `credited_at` |
| `budget_usage_events` | cada ventana de consumo liquidada |
| `impressions` | render de una campaña en una superficie |
| `visitor_events` | sesiones anónimas |
| `outbound_clicks` | clics salientes, con bandera `verified` |
| `rank_snapshots` | historial de posiciones |
| `moderation_events` | acción, motivo, moderador |
| `audit_logs` | quién, qué, cuándo y por qué |
| `processed_webhook_events` | protección contra reenvío de webhooks |

Decisiones que vale la pena conocer:

- **El dinero es siempre entero en céntimos.** Nunca `float`. Además hay un
  `CHECK (active_cents >= 0)`: un saldo financiado con dinero real no puede
  quedar negativo ni por un error de la aplicación.
- **`flagged` es un booleano, no un estado.** FLAGGED y PAUSED son
  independientes por diseño, como pediste.
- **`rank_history` se deriva de snapshots reales**, ya no es un array semilla.
- **`minutes_at_one`** en lugar de horas: la posición se muestrea cada 5
  minutos, así que un contador de horas incrementado por snapshot habría sido
  simplemente incorrecto. La capa de dominio expone horas enteras derivadas.

---

## 3. Motor de presupuesto: qué se verificó y qué se corrigió

`computeConsumption()` sigue siendo una función pura, sin dependencias, y la
probé numéricamente:

| Prueba | Resultado |
|---|---|
| PAUSED consume | 0 ✓ |
| PENDING consume | 0 ✓ |
| REJECTED consume | 0 ✓ |
| Consumo limitado al saldo | ✓ |
| 72 h en una liquidación vs 4320 liquidaciones por minuto | idénticos ✓ |

**Bug encontrado y corregido durante esta etapa.** Al truncar el consumo a
céntimos enteros y avanzar el reloj hasta `now`, el residuo fraccionario se
descartaba en cada liquidación. Con tasas no enteras y liquidaciones
frecuentes esto **subconsumía un 1,2 % diario**: el consumo dependía de la
frecuencia de liquidación, que es exactamente lo que un motor determinístico
no debe permitir.

Corrección: el reloj avanza el tiempo que representan los céntimos consumidos,
no hasta `now`, arrastrando el residuo. Error residual medido por debajo del
0,05 % diario. El redondeo es hacia arriba **a propósito**, para que cualquier
error restante deje al anunciante con algo más de exposición de la pagada,
nunca menos.

**Concurrencia.** Toda mutación de saldo corre en una transacción con
`SELECT … FOR UPDATE` sobre la campaña y su presupuesto. Dos instancias que
liquiden o acrediten la misma campaña se serializan en vez de duplicar el
gasto. Esto es lo que hacía imposible operar con el almacén en memoria.

---

## 4. Reglas que siguen garantizadas

- **PAUSED no consume presupuesto.** Se liquida *antes* de pausar, y al
  reanudar se reinicia `last_settled_at`, así que el periodo pausado nunca se
  factura retroactivamente.
- **REJECTED nunca rankea.** El ranking filtra en SQL por
  `status = 'ACTIVE' AND active_cents > 0`; PENDING, PAUSED, EXHAUSTED y
  REJECTED quedan fuera de la consulta, no por un filtro en el cliente.
- **Autorización server-side intacta.** Cada endpoint `/api/admin/*`
  revalida la sesión firmada. Sin secretos configurados, el admin queda
  cerrado, no abierto.
- **El presupuesto solo sube en `creditBudget()`**, llamado únicamente desde
  `applyVerifiedPayment()`. Ahora la idempotencia es de base de datos: clave
  primaria sobre el id de evento del proveedor, más un `UPDATE … WHERE
  credited_at IS NULL` que solo una ejecución concurrente puede ganar.

---

## 5. Qué falta para producción

**Bloqueantes:**

1. **Ejecutar y probar contra un Postgres real.** Nada de esto se ha
   ejecutado nunca. Es el paso inmediato.
2. **PayPal Sandbox**, que es la etapa siguiente que acordamos.
3. **Autenticación de anunciantes.** Todo se atribuye al usuario demo
   `user-demo-advertiser`; no hay registro ni propiedad real de campañas.
4. **Rate limiting** en `/api/analytics/event`, `/api/campaigns` y
   `/api/admin/session`. Ahora mismo son abusables, y con base de datos un
   abuso ya escribe filas reales.
5. **Términos de Servicio, Privacidad y reglas de reembolso**, enlazados desde
   el checkout.
6. Sustituir la contraseña de administrador compartida por credenciales por
   usuario con hash y segundo factor.

**Recomendados:**

7. Tests del motor de presupuesto. `computeConsumption()` es pura y aislada;
   las pruebas de §3 deberían vivir en el repositorio, no en mi terminal.
8. `pnpm-lock.yaml` quedó desactualizado al añadir dependencias. Si usas npm,
   bórralo y usa `package-lock.json`; si usas pnpm, regenéralo.
9. Atribución real de visitantes por campaña. Hoy `visitors` en
   `campaign_stats` arranca desde valores semilla y no se incrementa; solo
   impressions y outbound clicks son reales.
10. Retención de eventos. `impressions`, `visitor_events` y `outbound_clicks`
    crecen sin límite; hará falta particionado o purga programada.

---

## 6. Variables de entorno

Ver `.env.example`. Ningún secreto tiene valor por defecto y no se inventó
ninguno.

| Variable | Obligatoria para | Sin ella |
|---|---|---|
| `DATABASE_URL` | **Todo** | La app falla en cerrado (503) |
| `DATABASE_POOL_MAX` | Ajuste de conexiones | Por defecto 5 |
| `RANKBURN_ALLOW_SEED` | Datos demo | Endpoint de seed rechaza (403) |
| `NEXT_PUBLIC_SITE_URL` | URLs de retorno de pago | `http://localhost:3000` |
| `RANKBURN_SESSION_SECRET` | Sesión de admin | Admin cerrado |
| `RANKBURN_ADMIN_EMAILS` | Allowlist de admin | Admin cerrado |
| `RANKBURN_ADMIN_PASSWORD` | Login de admin | Admin cerrado |
| `PAYPAL_CLIENT_ID` / `_SECRET` / `_WEBHOOK_ID` | Checkout | Checkout deshabilitado |
| `PAYPAL_API_BASE` | Entorno PayPal | Sandbox |

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 7. Ejecutar localmente

```bash
# 1. Postgres (cualquier instancia sirve)
docker run -d --name rankburn-db -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=rankburn -p 5432:5432 postgres:16

# 2. Configuración
npm install
cp .env.example .env.local
# rellena DATABASE_URL, RANKBURN_SESSION_SECRET, RANKBURN_ADMIN_EMAILS,
# RANKBURN_ADMIN_PASSWORD y pon RANKBURN_ALLOW_SEED=true

# 3. Esquema
npm run db:setup

# 4. Arranque
npm run typecheck
npm run dev
```

Para cargar los datos demo: inicia sesión en `/admin/login` y haz

```bash
curl -X POST http://localhost:3000/api/admin/seed \
  -H "Cookie: rankburn_session=<tu cookie de sesión>"
```

El seed es idempotente: no hace nada si ya existen campañas.

Sin credenciales de PayPal el checkout muestra un estado explícito de no
disponible y **no** crea presupuesto. Es el comportamiento correcto.

---

## 8. Desplegar en Vercel

1. Sube el repositorio e impórtalo en Vercel.
2. Provisiona Postgres (Neon, Supabase, Vercel Postgres o Railway) y copia la
   cadena de conexión a `DATABASE_URL`. Los proveedores gestionados suelen
   requerir `?sslmode=require`.
3. Añade el resto de variables de §6. **No pongas `RANKBURN_ALLOW_SEED` en
   producción.**
4. Aplica el esquema apuntando `DATABASE_URL` a la base remota y ejecutando
   `npm run db:setup` desde tu máquina.
5. Despliega.

Nota sobre conexiones: cada instancia serverless abre su propio pool. Con
muchas instancias conviene un pooler (PgBouncer, o el pooler de Neon/Supabase)
y `DATABASE_POOL_MAX` bajo.

---

## 9. Siguiente paso recomendado

**Levantar Postgres y ejercitar el sistema de extremo a extremo antes de tocar
PayPal.**

Concretamente, y en este orden:

1. `npm run typecheck` con las dependencias instaladas. Es la primera vez que
   las consultas Drizzle se validan contra tipos reales; espera correcciones
   ahí.
2. `npm run db:setup` y comprobar que las 13 tablas existen.
3. Sembrar datos y verificar que `/api/market` devuelve el ranking ordenado.
4. Probar el ciclo de moderación: aprobar, pausar (confirmar que el saldo deja
   de bajar), reanudar (confirmar que no se factura el periodo pausado),
   marcar, rechazar con motivo.
5. Dejar una campaña corriendo unas horas y confirmar que el saldo baja
   conforme a la tasa **con el navegador cerrado**. Esa es la prueba de que el
   motor es realmente server-side.

Cuando eso funcione, PayPal Sandbox es la etapa siguiente.

**Estado actual: la persistencia está escrita pero no probada. No aceptes
pagos reales.**
